import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { CouponScope, CouponType, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WechatAuthService } from "../auth/wechat-auth.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RegistrationService } from "../registration/registration.service";
import { applyMallCoupon } from "../mall/mall-coupon-pricing";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";
import { AdminCouponDistributionController, CouponDistributionController } from "./coupon-distribution.controller";
import { CouponDistributionService, distributionStatus } from "./coupon-distribution.service";
import { PublicOperationsService } from "./public-operations.service";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminManagementService } from "./admin-management.service";

class WechatLinkStub extends WechatAuthService {
  token = "";
  fail = false;
  calls = 0;
  override async generateCouponClaimLink(token: string) {
    this.token = token;
    this.calls++;
    if (this.fail) throw new Error("Local simulated WeChat failure");
    return "https://wxaurl.cn/local-test-only";
  }
}

describe("directed coupon validation and authorization", () => {
  it("protects administration and claiming while allowing only a sanitized preview", () => {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminCouponDistributionController), [AdminJwtAuthGuard, AdminPermissionGuard]);
    for (const method of ["create", "link", "revoke"] as const) assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminCouponDistributionController.prototype[method]), ["coupon:write"]);
    assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminCouponDistributionController.prototype.list), ["coupon:view"]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, CouponDistributionController.prototype.claim), [JwtAuthGuard]);
  });
  it("rejects malformed requests before any database call", async () => {
    const service = new CouponDistributionService({} as PrismaService, new WechatLinkStub());
    const base = { couponId: "coupon", targetPhone: "13800000001", idempotencyKey: randomUUID() };
    for (const input of [null, [], {}, { ...base, targetUserId: "u" }, { ...base, targetPhone: "bad" }, { ...base, expiresInHours: 169 }, { ...base, expiresInHours: 0 }, { ...base, idempotencyKey: "short" }]) {
      await assert.rejects(service.create(input, { id: "a", username: "qa", displayName: null }));
    }
    await assert.rejects(service.claim({ token: "x".repeat(43) }, undefined));
    await assert.rejects(service.preview({ token: "invalid" }));
  });
  it("keeps received grants received after the invitation deadline", () => {
    const past = new Date(0), future = new Date(Date.now() + 60000);
    assert.equal(distributionStatus({ claimedAt: past, revokedAt: null, expiresAt: past }), "CLAIMED");
    assert.equal(distributionStatus({ claimedAt: null, revokedAt: past, expiresAt: future }), "REVOKED");
    assert.equal(distributionStatus({ claimedAt: null, revokedAt: null, expiresAt: past }), "EXPIRED");
  });
});

const databaseUrl = process.env.COUPON_TEST_DATABASE_URL;
// Never point the integration suite at an existing development or production DB.
if (databaseUrl) {
  const url = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "55432" && url.pathname === "/coupon_distribution_test", "A disposable local coupon_distribution_test DB on port 55432 is required");
}

describe("directed coupons with real PostgreSQL transactions", { skip: !databaseUrl }, () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  const prisma = db as PrismaService;
  const wechat = new WechatLinkStub();
  const service = new CouponDistributionService(prisma, wechat);
  const publicService = new PublicOperationsService(prisma);
  const operations = new AdminOperationsService(prisma);
  const management = new AdminManagementService(prisma);
  const registration = new RegistrationService(prisma);
  let admin: { id: string; username: string; displayName: string | null };
  let owner: { id: string; openid: string | null; nickname: string | null };
  let other: typeof owner;
  let samePhone: typeof owner;
  let unverified: typeof owner;
  let conferenceId: string;
  let skuId: string;
  before(async () => {
    const suffix = randomUUID();
    admin = await db.adminUser.create({ data: { username: `coupon-qa-${suffix}`, passwordHash: "unused-local-test-only" } });
    const data = { realName: "QA guest", phone: "13800000001", phoneVerifiedAt: new Date(), activatedAt: new Date() };
    owner = await db.user.create({ data: { ...data, openid: `qa-owner-${suffix}` } });
    other = await db.user.create({ data: { ...data, phone: "13800000002", openid: `qa-other-${suffix}` } });
    samePhone = await db.user.create({ data: { ...data, openid: `qa-same-phone-${suffix}` } });
    unverified = await db.user.create({ data: { ...data, phoneVerifiedAt: null, openid: `qa-unverified-${suffix}` } });
    const conference = await db.conference.create({ data: { title: "Coupon QA", slug: `coupon-qa-${suffix}`, status: "PUBLISHED", startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), skus: { create: { name: "QA ticket", priceCent: 10000, stock: 100 } } }, include: { skus: true } });
    conferenceId = conference.id; skuId = conference.skus[0]!.id;
  });
  after(async () => { await db.$disconnect(); });

  async function coupon(totalLimit: number | null = null) {
    return db.coupon.create({ data: { code: `QA${randomUUID().replaceAll("-", "").toUpperCase()}`, name: "QA invitation coupon", type: CouponType.AMOUNT, scope: CouponScope.BOTH, discountAmountCent: 2000, conferenceId, totalLimit, perUserLimit: 1 } });
  }
  async function invite(couponId: string, targetPhone = "13800000001") {
    const result = await service.create({ couponId, targetPhone, idempotencyKey: randomUUID() }, admin);
    const link = await service.link(result.data.id);
    const token = link.data.path.split("token=")[1]!;
    return { id: result.data.id, token };
  }

  it("issues once despite concurrent retry, records audit and notice, and lists a campaign-less coupon", async () => {
    const c = await coupon(1);
    const input = { couponId: c.id, targetUserId: owner.id, idempotencyKey: randomUUID() };
    const [a, b] = await Promise.all([service.create(input, admin), service.create(input, admin)]);
    assert.equal(a.data.id, b.data.id); assert.equal(a.data.status, "CLAIMED");
    assert.equal(await db.couponClaim.count({ where: { couponId: c.id } }), 1);
    assert.equal(await db.userNotification.count({ where: { sourceKey: `coupon-distribution:${a.data.id}` } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: a.data.id, action: "CREATE" } }), 1);
    const mine = (await publicService.myCoupons(owner)).data.items.find(item => item.coupon.id === c.id)!;
    assert.equal(mine.usable, true); assert.equal(mine.campaign.name, "会务定向发放");
    await assert.rejects(service.create({ ...input, targetUserId: other.id }, admin), /请求已用于其他/);
    await assert.rejects(service.create({ ...input, idempotencyKey: randomUUID() }, admin), /已领取过/);
  });

  it("checks the database-verified phone, never the JWT/profile or supplied body phone", async () => {
    const c = await coupon(); const i = await invite(c.id);
    await assert.rejects(service.claim({ token: i.token, phone: "13800000001" }, { ...other, phone: "13800000001", phoneVerifiedAt: new Date().toISOString() }), /手机号与指定/);
    await assert.rejects(service.claim({ token: i.token }, unverified), /授权并验证/);
    const first = await service.claim({ token: i.token }, owner);
    const repeat = await service.claim({ token: i.token }, owner);
    assert.equal(first.data.alreadyClaimed, false); assert.equal(repeat.data.alreadyClaimed, true);
    await assert.rejects(service.claim({ token: i.token }, samePhone), /其他账号/);
    assert.equal(await db.couponClaim.count({ where: { distributionId: i.id } }), 1);
  });

  it("does not double-claim when two verified accounts with the invited phone race", async () => {
    const c = await coupon(); const i = await invite(c.id);
    const outcomes = await Promise.allSettled([service.claim({ token: i.token }, owner), service.claim({ token: i.token }, samePhone)]);
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(await db.couponClaim.count({ where: { distributionId: i.id } }), 1);
  });

  it("reserves the last distribution slot atomically and releases an unclaimed revoked invitation", async () => {
    const c = await coupon(1);
    const outcomes = await Promise.allSettled(["13800000001", "13800000002"].map(targetPhone => service.create({ couponId: c.id, targetPhone, idempotencyKey: randomUUID() }, admin)));
    const passed = outcomes.filter(item => item.status === "fulfilled"); assert.equal(passed.length, 1);
    const id = (passed[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof service.create>>>).value.data.id;
    await service.revoke(id, admin);
    const next = await service.create({ couponId: c.id, targetUserId: owner.id, idempotencyKey: randomUUID() }, admin);
    assert.equal(next.data.status, "CLAIMED");
    await assert.rejects(service.revoke(next.data.id, admin), /已到账/);
  });

  it("a racing revoke and claim cannot leave a revoked coupon in the wallet", async () => {
    const c = await coupon(); const i = await invite(c.id);
    await Promise.allSettled([service.revoke(i.id, admin), service.claim({ token: i.token }, owner)]);
    const row = await db.couponDistribution.findUniqueOrThrow({ where: { id: i.id } });
    assert.notEqual(Boolean(row.revokedAt), Boolean(row.claimedAt));
    assert.equal(await db.couponClaim.count({ where: { distributionId: i.id } }), row.claimedAt ? 1 : 0);
  });

  it("rejects expired, revoked, disabled and deleted invitations", async () => {
    for (const mode of ["expired", "revoked", "disabled", "deleted"]) {
      const c = await coupon(); const i = await invite(c.id);
      if (mode === "expired") await db.couponDistribution.update({ where: { id: i.id }, data: { expiresAt: new Date(0) } });
      if (mode === "revoked") await service.revoke(i.id, admin);
      if (mode === "disabled") await db.coupon.update({ where: { id: c.id }, data: { enabled: false } });
      if (mode === "deleted") await db.coupon.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      await assert.rejects(service.claim({ token: i.token }, owner));
      await assert.rejects(service.link(i.id));
      assert.equal(await db.couponClaim.count({ where: { distributionId: i.id } }), 0);
    }
  });

  it("link retry preserves the same encrypted token without issuing another invitation", async () => {
    const c = await coupon(); const a = await service.create({ couponId: c.id, targetPhone: "13800000001", idempotencyKey: randomUUID() }, admin);
    wechat.fail = true; await assert.rejects(service.link(a.data.id)); const token = wechat.token;
    wechat.fail = false; await service.link(a.data.id); assert.equal(wechat.token, token);
    const row = await db.couponDistribution.findUniqueOrThrow({ where: { id: a.data.id } });
    assert.ok(row.tokenEncrypted && !row.tokenEncrypted.includes(token)); assert.notEqual(row.tokenHash, token);
    const preview = (await service.preview({ token })).data;
    assert.equal(preview.targetPhoneMasked, "138****0001");
    assert.ok(!JSON.stringify(preview).includes(c.code));
    assert.ok(!JSON.stringify((await service.list({ couponId: c.id })).data).includes(token));
    assert.ok(!JSON.stringify(await db.auditLog.findMany({ where: { entityId: a.data.id } })).includes(token));
    assert.equal(await db.couponDistribution.count({ where: { couponId: c.id } }), 1);
  });

  it("blocks guessing a directed code before its first claim in registration and mall, then applies server cents", async () => {
    const c = await coupon(); const i = await invite(c.id);
    const quote = { conferenceId, skuId, quantity: 1, couponCode: c.code };
    await assert.rejects(registration.quote(quote, owner), /先领取/);
    await assert.rejects(applyMallCoupon(prisma, { couponCode: c.code, userId: owner.id, items: [{ skuId: "qa", quantity: 1, totalAmountCent: 10000 }], originAmountCent: 10000 }), /先领取/);
    await service.claim({ token: i.token }, owner);
    const priced = (await registration.quote(quote, owner)).data;
    assert.equal(priced.discountAmountCent, 2000); assert.equal(priced.payableAmountCent, 8000);
    await assert.rejects(registration.quote(quote, other), /先领取/);
  });

  it("preserves legacy public campaign claiming and legacy raw-code pricing", async () => {
    const c = await coupon();
    assert.equal((await registration.quote({ conferenceId, skuId, quantity: 1, couponCode: c.code }, owner)).data.payableAmountCent, 8000);
    const campaign = await db.couponCampaign.create({ data: { name: "QA public", claimCode: randomUUID(), qrScene: randomUUID(), coupons: { create: { couponId: c.id } } } });
    const first = await publicService.claimCoupon({ claimCode: campaign.claimCode }, owner);
    const again = await publicService.claimCoupon({ claimCode: campaign.claimCode }, owner);
    assert.equal(first.data.claims[0]!.id, again.data.claims[0]!.id);
    assert.equal((await db.couponCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).claimedCount, 1);
  });

  it("keeps public campaigns and targeted coupons separate in both directions", async () => {
    const publicCoupon = await coupon(1);
    const claimCode = randomUUID();
    await operations.createCouponCampaign({ name: "Public QA", claimCode, couponIds: [publicCoupon.id] }, admin);
    await assert.rejects(service.create({ couponId: publicCoupon.id, targetPhone: "13800000001", idempotencyKey: randomUUID() }, admin), /关联公开/);
    await publicService.claimCoupon({ claimCode }, other);
    const directed = await coupon(1);
    const i = await invite(directed.id);
    await assert.rejects(operations.createCouponCampaign({ name: "Blocked QA", couponIds: [directed.id] }, admin), /定向券不能/);
    // A legacy or imported association must not bypass the public-claim guard either.
    const imported = await db.couponCampaign.create({ data: { name: "Imported QA", claimCode: randomUUID(), qrScene: randomUUID(), coupons: { create: { couponId: directed.id } } } });
    assert.equal((await publicService.couponCampaignPublic(imported.id)).data.claimable, false);
    await assert.rejects(publicService.claimCoupon({ claimCode: imported.claimCode }, other), /暂无可领取/);
    await service.claim({ token: i.token }, owner);
    assert.equal(await db.couponClaim.count({ where: { couponId: directed.id } }), 1);
  });

  it("concurrent public association and private issuance cannot both commit", async () => {
    const c = await coupon();
    const outcomes = await Promise.allSettled([
      operations.createCouponCampaign({ name: "Race QA", couponIds: [c.id] }, admin),
      service.create({ couponId: c.id, targetPhone: "13800000001", idempotencyKey: randomUUID() }, admin)
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    const publicCount = await db.couponCampaignCoupon.count({ where: { couponId: c.id } });
    const directedCount = await db.couponDistribution.count({ where: { couponId: c.id } });
    assert.equal(publicCount + directedCount, 1);
  });

  it("requires a one-use template and prevents increasing its limit after issuance", async () => {
    const c = await coupon();
    for (const perUserLimit of [null, 2]) {
      await db.coupon.update({ where: { id: c.id }, data: { perUserLimit } });
      await assert.rejects(service.create({ couponId: c.id, targetUserId: owner.id, idempotencyKey: randomUUID() }, admin), /每人限用 1 次/);
    }
    await db.coupon.update({ where: { id: c.id }, data: { perUserLimit: 1 } });
    await invite(c.id);
    await assert.rejects(management.updateCoupon(c.id, { perUserLimit: 2 }, admin), /每人限用 1 次/);
    await assert.rejects(management.updateCoupon(c.id, { perUserLimit: null }, admin), /每人限用 1 次/);
  });

  it("does not reserve a new phone invitation for an existing coupon owner", async () => {
    const c = await coupon(2);
    await service.create({ couponId: c.id, targetUserId: owner.id, idempotencyKey: randomUUID() }, admin);
    await assert.rejects(service.create({ couponId: c.id, targetPhone: "13800000001", idempotencyKey: randomUUID() }, admin), /已领取过/);
    assert.equal(await db.couponDistribution.count({ where: { couponId: c.id } }), 1);
    await service.create({ couponId: c.id, targetUserId: other.id, idempotencyKey: randomUUID() }, admin);
  });

  it("never acknowledges a duplicate invitation under a different retry identity", async () => {
    const c = await coupon(1);
    const input = { couponId: c.id, targetPhone: "13800000001", idempotencyKey: randomUUID() };
    const first = await service.create(input, admin);
    await assert.rejects(service.create({ ...input, idempotencyKey: randomUUID() }, admin), /已有待领取邀请/);
    await service.revoke(first.data.id, admin);
    const retry = await service.create(input, admin);
    assert.equal(retry.data.id, first.data.id);
    assert.equal(retry.data.status, "REVOKED");
    assert.equal(await db.couponDistribution.count({ where: { couponId: c.id } }), 1);
  });

  it("counts all historical uses even when the same user has a claim", async () => {
    const c = await coupon(2);
    await service.create({ couponId: c.id, targetUserId: owner.id, idempotencyKey: randomUUID() }, admin);
    for (let index = 0; index < 2; index++) {
      await db.order.create({ data: { orderNo: `QA-${randomUUID()}`, userId: owner.id, conferenceId, skuId, originAmountCent: 10000, payableAmountCent: 8000, status: "PAID", submittedFormJson: {}, couponRedemptions: { create: { couponId: c.id, userId: owner.id, status: "USED" } } } });
    }
    await assert.rejects(service.create({ couponId: c.id, targetUserId: other.id, idempotencyKey: randomUUID() }, admin), /额度不足/);
    assert.equal(await db.couponDistribution.count({ where: { couponId: c.id } }), 1);
  });

  it("shows actual usage conditions without exposing private codes or treating removed SKUs as unrestricted", async () => {
    const c = await coupon();
    const startAt = new Date(Date.now() + 3600000);
    await db.coupon.update({ where: { id: c.id }, data: { minAmountCent: 25000, minQuantity: 2, maxDiscountCent: 3000, startAt, allowedSkuIds: [skuId, "removed-sku-id"] } });
    const i = await invite(c.id);
    const preview = (await service.preview({ token: i.token })).data;
    assert.equal(preview.coupon.minAmountCent, 25000);
    assert.equal(preview.coupon.minQuantity, 2);
    assert.equal(preview.coupon.maxDiscountCent, 3000);
    assert.equal(preview.coupon.startAt, startAt.toISOString());
    assert.deepEqual(preview.coupon.allowedSkuNames, ["QA ticket", "指定规格（已不可用）"]);
    assert.doesNotMatch(JSON.stringify(preview), new RegExp(`${c.code}|removed-sku-id|13800000001`));
  });
});
