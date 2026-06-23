import { BadRequestException } from "@nestjs/common";
import { CouponClaimStatus, CouponRedemptionStatus, CouponScope, CouponType, Prisma } from "@prisma/client";

export interface MallCouponPricedItem {
  skuId: string;
  quantity: number;
  totalAmountCent: number;
}

interface MallCouponRecord {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  scope: CouponScope;
  discountAmountCent: number | null;
  discountPercent: number | null;
  maxDiscountCent: number | null;
  minAmountCent: number | null;
  minQuantity: number | null;
  totalLimit: number | null;
  perUserLimit: number | null;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  allowedSkuIds: Prisma.JsonValue | null;
}

export interface AppliedMallCoupon {
  couponId: string;
  couponCode: string;
  title: string;
  discountAmountCent: number;
  snapshot: Prisma.InputJsonObject;
}

type CouponClient = {
  coupon: { findUnique(args: unknown): Promise<MallCouponRecord | null> };
  couponClaim?: { count(args: unknown): Promise<number>; updateMany(args: unknown): Promise<unknown> };
  couponRedemption?: { count(args: unknown): Promise<number> };
  mallCouponRedemption?: { count(args: unknown): Promise<number> };
};

export async function applyMallCoupon(
  prisma: Prisma.TransactionClient | CouponClient,
  input: {
    couponCode: string | null;
    userId: string;
    items: MallCouponPricedItem[];
    originAmountCent: number;
  }
): Promise<AppliedMallCoupon | null> {
  if (!input.couponCode) return null;
  const client = prisma as unknown as CouponClient;
  const code = input.couponCode.trim().toUpperCase();
  const coupon = await client.coupon.findUnique({ where: { code } });
  if (!coupon) throw new BadRequestException("优惠券不存在");

  validateMallCoupon(coupon, input.items, input.originAmountCent);
  await ensureCouponClaimed(client, coupon.id, input.userId);
  await ensureCouponLimit(client, coupon, input.userId);

  const scopedAmountCent = filterAllowedItems(input.items, coupon.allowedSkuIds).reduce((sum, item) => sum + item.totalAmountCent, 0);
  const discountAmountCent = calculateCouponAmount(coupon, scopedAmountCent);
  if (discountAmountCent <= 0) throw new BadRequestException("优惠券未产生可抵扣金额");

  return {
    couponId: coupon.id,
    couponCode: coupon.code,
    title: coupon.name || `优惠券 ${coupon.code}`,
    discountAmountCent,
    snapshot: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      scope: coupon.scope,
      discountAmountCent: coupon.discountAmountCent,
      discountPercent: coupon.discountPercent,
      maxDiscountCent: coupon.maxDiscountCent,
      minAmountCent: coupon.minAmountCent,
      minQuantity: coupon.minQuantity,
      allowedSkuIds: readAllowedSkuIds(coupon.allowedSkuIds)
    }
  };
}

async function ensureCouponClaimed(client: CouponClient, couponId: string, userId: string) {
  if (!client.couponClaim?.count) return;
  const [totalClaims, userClaims] = await Promise.all([
    client.couponClaim.count({ where: { couponId } }),
    client.couponClaim.count({ where: { couponId, userId, status: CouponClaimStatus.CLAIMED } })
  ]);
  if (totalClaims > 0 && userClaims === 0) {
    throw new BadRequestException("请先领取该优惠券");
  }
}

async function ensureCouponLimit(client: CouponClient, coupon: MallCouponRecord, userId: string) {
  if (typeof coupon.totalLimit === "number") {
    const [registrationUsed, mallUsed] = await Promise.all([
      client.couponRedemption?.count({
        where: { couponId: coupon.id, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
      }) ?? 0,
      client.mallCouponRedemption?.count({
        where: { couponId: coupon.id, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
      }) ?? 0
    ]);
    if (registrationUsed + mallUsed >= coupon.totalLimit) throw new BadRequestException("优惠券已被领完或使用完");
  }

  if (typeof coupon.perUserLimit === "number") {
    const [registrationUsed, mallUsed] = await Promise.all([
      client.couponRedemption?.count({
        where: { couponId: coupon.id, userId, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
      }) ?? 0,
      client.mallCouponRedemption?.count({
        where: { couponId: coupon.id, userId, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
      }) ?? 0
    ]);
    if (registrationUsed + mallUsed >= coupon.perUserLimit) throw new BadRequestException("你已使用过该优惠券");
  }
}

function validateMallCoupon(coupon: MallCouponRecord, items: MallCouponPricedItem[], originAmountCent: number) {
  if (!coupon.enabled) throw new BadRequestException("优惠券未启用");
  if (coupon.scope !== CouponScope.MALL && coupon.scope !== CouponScope.BOTH) throw new BadRequestException("优惠券不适用于商品购买");
  const now = new Date();
  if (coupon.startAt && coupon.startAt > now) throw new BadRequestException("优惠券尚未开始");
  if (coupon.endAt && coupon.endAt < now) throw new BadRequestException("优惠券已过期");
  if (typeof coupon.minAmountCent === "number" && originAmountCent < coupon.minAmountCent) throw new BadRequestException("订单金额未达到优惠券门槛");
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (typeof coupon.minQuantity === "number" && totalQuantity < coupon.minQuantity) throw new BadRequestException("商品数量未达到优惠券门槛");
  if (filterAllowedItems(items, coupon.allowedSkuIds).length === 0) throw new BadRequestException("订单商品不在优惠券适用范围内");
}

function calculateCouponAmount(coupon: MallCouponRecord, baseAmountCent: number): number {
  if (baseAmountCent <= 0) return 0;
  if (coupon.type === CouponType.AMOUNT) {
    return Math.min(coupon.discountAmountCent ?? 0, baseAmountCent);
  }
  const raw = Math.floor((baseAmountCent * (coupon.discountPercent ?? 0)) / 10000);
  return Math.min(raw, coupon.maxDiscountCent ?? raw, baseAmountCent);
}

function filterAllowedItems(items: MallCouponPricedItem[], allowedSkuIds: Prisma.JsonValue | null) {
  const allowed = readAllowedSkuIds(allowedSkuIds);
  return allowed.length === 0 ? items : items.filter((item) => allowed.includes(item.skuId));
}

function readAllowedSkuIds(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
