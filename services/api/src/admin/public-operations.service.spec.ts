import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CouponClaimStatus, CouponScope, CouponType } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PublicOperationsService } from "./public-operations.service";

const currentUser: CurrentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };

describe("PublicOperationsService coupon campaigns", () => {
  it("claims campaign coupons and returns existing claims idempotently", async () => {
    const prisma = createPublicOperationsPrismaMock();
    const service = new PublicOperationsService(prisma);

    const first = await service.claimCoupon({ claimCode: "CP2026" }, currentUser);
    const second = await service.claimCoupon({ claimCode: "CP2026" }, currentUser);

    assert.equal(first.data.claims.length, 1);
    assert.equal(second.data.claims[0]?.id, first.data.claims[0]?.id);
    assert.equal(prisma.campaign.claimedCount, 1);
  });

  it("rejects campaign claims when stock is exhausted", async () => {
    const prisma = createPublicOperationsPrismaMock({ claimedCount: 1, totalLimit: 1 });
    const service = new PublicOperationsService(prisma);

    await assert.rejects(() => service.claimCoupon({ claimCode: "CP2026" }, currentUser), ConflictException);
  });

  it("does not expose or issue disabled campaign coupons", async () => {
    const prisma = createPublicOperationsPrismaMock({ couponEnabled: false });
    const service = new PublicOperationsService(prisma);

    await assert.rejects(
      () => service.claimCoupon({ claimCode: "CP2026" }, currentUser),
      (error: unknown) => error instanceof ConflictException && /暂无可领取优惠券/.test(error.message)
    );
    const campaign = await service.couponCampaignPublic("campaign-1");

    assert.equal(campaign.data.claimable, false);
    assert.equal(campaign.data.statusText, "暂无可领取优惠券");
    assert.equal(campaign.data.coupons.length, 0);
    assert.equal(prisma.campaign.claimedCount, 0);
  });
});

describe("PublicOperationsService uploads", () => {
  it("rejects an after-sale attachment whose bytes do not match its image MIME type", async () => {
    const service = new PublicOperationsService(createPublicOperationsPrismaMock());

    await assert.rejects(
      () => service.uploadAfterSaleAttachment(
        { buffer: Buffer.from("<script>alert(1)</script>"), mimetype: "image/png", size: 25 },
        "https://api.example.com"
      ),
      BadRequestException
    );
  });
});

function createPublicOperationsPrismaMock(options: { claimedCount?: number; totalLimit?: number | null; couponEnabled?: boolean } = {}) {
  const now = new Date("2026-06-18T00:00:00.000Z");
  const coupon = {
    id: "coupon-1",
    code: "SAVE100",
    name: "立减 100",
    type: CouponType.AMOUNT,
    scope: CouponScope.CONFERENCE,
    discountAmountCent: 10000,
    discountPercent: null,
    minAmountCent: 0,
    enabled: options.couponEnabled ?? true,
    deletedAt: null,
    startAt: null,
    endAt: null
  };
  const campaign = {
    id: "campaign-1",
    name: "夏季领券",
    claimCode: "CP2026",
    qrScene: "CP2026",
    enabled: true,
    claimedCount: options.claimedCount ?? 0,
    totalLimit: options.totalLimit ?? 10,
    startAt: null,
    endAt: null,
    coupons: [{ couponId: coupon.id, coupon }]
  };
  const claims: CouponClaimRecord[] = [];
  const mock = {
    campaign,
    claims,
    couponCampaign: {
      findUnique: async ({ where }: { where: { claimCode?: string; id?: string } }) =>
        (where.claimCode === campaign.claimCode || where.id === campaign.id ? campaign : null),
      updateMany: async ({ where, data }: { where: { id: string; enabled: boolean; claimedCount?: { lt: number } }; data: { claimedCount: { increment: number } } }) => {
        if (where.id !== campaign.id || !campaign.enabled || (where.claimedCount && campaign.claimedCount >= where.claimedCount.lt)) {
          return { count: 0 };
        }
        campaign.claimedCount += data.claimedCount.increment;
        return { count: 1 };
      }
    },
    couponClaim: {
      findMany: async ({ where }: { where: { campaignId?: string; userId: string } }) =>
        claims.filter((item) => item.userId === where.userId && (!where.campaignId || item.campaignId === where.campaignId)),
      create: async ({ data }: { data: Omit<CouponClaimRecord, "id" | "claimedAt" | "createdAt" | "updatedAt"> }) => {
        const claim = { id: `claim-${claims.length + 1}`, claimedAt: now, createdAt: now, updatedAt: now, ...data };
        claims.push(claim);
        return claim;
      }
    },
    $transaction: async <T>(operation: (tx: any) => Promise<T>) => operation(mock)
  };
  return mock as typeof mock & PrismaService;
}

interface CouponClaimRecord {
  id: string;
  campaignId: string;
  couponId: string;
  userId: string;
  status: CouponClaimStatus;
  claimedAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
