import { request } from "./request";

export interface MemberBenefit {
  id: string;
  title: string;
  description: string | null;
  type: string;
  iconUrl?: string | null;
  autoGrant?: boolean;
  visible?: boolean;
  grantRule?: string | null;
  level?: { id: string; code: string; name: string };
}

export interface MemberLevel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rank: number;
  priceCent: number;
  discountPercent: number | null;
  defaultDays?: number | null;
  pricingEnabled?: boolean;
  benefits?: MemberBenefit[];
}

export interface CurrentMembership {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  level: MemberLevel;
}

export interface MemberBenefitGrant {
  id: string;
  status: string;
  source: string;
  grantedAt: string;
  usedAt: string | null;
  expiredAt: string | null;
  remark: string | null;
  benefit: MemberBenefit;
}

export interface MemberCenterData {
  levels: MemberLevel[];
  membership: CurrentMembership | null;
  grants: MemberBenefitGrant[];
  purchase: {
    enabled: boolean;
    message: string;
  };
}

export function getMemberLevels(): Promise<{ items: MemberLevel[] }> {
  return request<{ items: MemberLevel[] }>("/member/levels", {
    auth: false
  });
}

export function getMyMembership(): Promise<{ membership: CurrentMembership | null }> {
  return request<{ membership: CurrentMembership | null }>("/member/mine", {
    auth: true
  });
}

export function getMemberCenter(): Promise<MemberCenterData> {
  return request<MemberCenterData>("/member/center", {
    auth: true
  });
}

export function getMyMemberBenefits(): Promise<{ items: MemberBenefitGrant[] }> {
  return request<{ items: MemberBenefitGrant[] }>("/member/benefits", {
    auth: true
  });
}
