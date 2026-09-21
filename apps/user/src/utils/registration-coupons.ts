import type { MyCouponItem } from "../services/operations";

export function couponFitsRegistration(item: MyCouponItem, conferenceId: string,
  items: ReadonlyArray<{ skuId: string; quantity: number; priceCent: number }>, now = Date.now()): boolean {
  const coupon = item.coupon;
  if (!item.usable || coupon.enabled === false || !["CONFERENCE", "BOTH"].includes(coupon.scope)) return false;
  if (coupon.conferenceId && coupon.conferenceId !== conferenceId) return false;
  if (coupon.startAt && Date.parse(coupon.startAt) > now) return false;
  if (coupon.endAt && Date.parse(coupon.endAt) <= now) return false;
  const eligible = items.filter(item => !coupon.allowedSkuIds?.length || coupon.allowedSkuIds.includes(item.skuId));
  const quantity = eligible.reduce((sum, item) => sum + item.quantity, 0);
  const amount = eligible.reduce((sum, item) => sum + item.quantity * item.priceCent, 0);
  return quantity > 0 && quantity >= (coupon.minQuantity ?? 0) && amount >= (coupon.minAmountCent ?? 0);
}

export function readPendingRegistrationCoupon(raw: unknown, conferenceId: string, userId: string, now = Date.now()): string {
  if (!raw || typeof raw !== "object") return "";
  const item = raw as Record<string, unknown>;
  if (!userId || item.userId !== userId || (item.conferenceId && item.conferenceId !== conferenceId)) return "";
  if (!["CONFERENCE", "BOTH"].includes(String(item.scope))) return "";
  if (typeof item.savedAt !== "number" || now < item.savedAt || now - item.savedAt >= 30 * 60_000) return "";
  return typeof item.code === "string" ? item.code.trim() : "";
}
