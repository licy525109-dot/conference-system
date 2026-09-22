import { apiRequest, toQuery } from "./api";

export interface DistributionUser {
  id: string;
  realName?: string | null;
  nickname?: string | null;
  wechatNickname?: string | null;
  phone?: string | null;
}

export interface DistributionCoupon {
  id: string;
  name: string;
  code: string;
  conferenceId: string | null;
}

export interface CouponDistribution {
  id: string;
  couponId: string;
  coupon: DistributionCoupon;
  targetUserId: string | null;
  targetUser: DistributionUser | null;
  targetPhoneMasked: string | null;
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REVOKED";
  expiresAt: string;
  claimedAt: string | null;
  createdAt: string;
  remark: string | null;
  claimUserId: string | null;
  claimUser: DistributionUser | null;
}

export type CreateCouponDistribution = {
  couponId: string;
  remark?: string;
  expiresInHours?: number;
  idempotencyKey: string;
} & ({ targetUserId: string; targetPhone?: never } | { targetPhone: string; targetUserId?: never });

export interface CouponDistributionLink {
  url: string;
  path: string;
  expiresAt: string;
}

export function listCouponDistributions(params: { couponId?: string; userId?: string; page?: number; pageSize?: number }) {
  return apiRequest<{ items: CouponDistribution[]; total: number; page: number; pageSize: number }>(
    `/admin/coupon-distributions${toQuery(params)}`
  );
}

export function createCouponDistribution(input: CreateCouponDistribution) {
  return apiRequest<CouponDistribution>("/admin/coupon-distributions", { method: "POST", body: JSON.stringify(input) });
}

export function createCouponDistributionLink(id: string) {
  return apiRequest<CouponDistributionLink>(`/admin/coupon-distributions/${encodeURIComponent(id)}/link`, { method: "POST", body: "{}" });
}

export function revokeCouponDistribution(id: string) {
  return apiRequest<CouponDistribution>(`/admin/coupon-distributions/${encodeURIComponent(id)}/revoke`, { method: "POST", body: "{}" });
}
