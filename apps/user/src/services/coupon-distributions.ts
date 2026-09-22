import { ApiRequestError, request } from "./request";

export interface CouponDistributionPreview {
  coupon: {
    name: string;
    type: "AMOUNT" | "PERCENT";
    discountAmountCent: number | null;
    discountPercent: number | null;
    conferenceTitle: string | null;
    endAt: string | null;
    minAmountCent?: number | null;
    minQuantity?: number | null;
    startAt?: string | null;
    maxDiscountCent?: number | null;
    scope?: "CONFERENCE" | "MALL" | "BOTH";
    allowedSkuNames?: string[];
  };
  targetPhoneMasked: string;
  expiresAt: string;
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REVOKED";
}

export interface CouponDistributionClaimResult {
  id: string;
  status: "CLAIMED";
  alreadyClaimed: boolean;
  couponId: string;
}

export class CouponDistributionError extends Error {
  constructor(readonly kind: "INVALID_LINK" | "RETRYABLE", message: string) {
    super(message);
    this.name = "CouponDistributionError";
  }
}

export function isCouponDistributionToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function invalidLink(): CouponDistributionError {
  return new CouponDistributionError("INVALID_LINK", "领取链接无效或已失效，请联系发券方核对。");
}

function safeError(error: unknown, preview: boolean): CouponDistributionError {
  if (error instanceof CouponDistributionError) return error;
  const status = error instanceof ApiRequestError ? error.statusCode : undefined;
  if (status === 404 || status === 410 || (preview && (status === 400 || status === 403))) return invalidLink();
  // Never retain transport diagnostics or server messages that could contain private data.
  return new CouponDistributionError("RETRYABLE", preview
    ? "暂时无法读取优惠券，请检查网络后重试。"
    : status === 409
      ? "领取状态已变化，请联系发券方核对，或到我的优惠券查看。"
      : status === 400 || status === 403
      ? "领取未完成，请确认当前账号已验证的手机号与受邀手机号一致，或联系发券方核对。"
      : "领取结果暂未确认，请稍后重试，或到我的优惠券核对。");
}

export async function previewCouponDistribution(token: string): Promise<CouponDistributionPreview> {
  if (!isCouponDistributionToken(token)) throw invalidLink();
  try {
    const data = await request<CouponDistributionPreview>("/coupon-distributions/preview", { method: "POST", data: { token }, auth: false });
    if (!data?.coupon || !["PENDING", "CLAIMED", "EXPIRED", "REVOKED"].includes(data.status)) throw invalidLink();
    return data;
  } catch (error) {
    throw safeError(error, true);
  }
}

export async function claimCouponDistribution(token: string): Promise<CouponDistributionClaimResult> {
  if (!isCouponDistributionToken(token)) throw invalidLink();
  try {
    const data = await request<CouponDistributionClaimResult>("/coupon-distributions/claim", { method: "POST", data: { token } });
    if (data?.status !== "CLAIMED" || typeof data.alreadyClaimed !== "boolean"
      || typeof data.id !== "string" || !data.id || typeof data.couponId !== "string" || !data.couponId) {
      throw new CouponDistributionError("RETRYABLE", "领取结果暂未确认，请稍后重试，或到我的优惠券核对。");
    }
    return data;
  } catch (error) {
    throw safeError(error, false);
  }
}
