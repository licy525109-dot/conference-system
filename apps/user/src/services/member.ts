import { request } from "./request";

export interface MemberBenefit {
  id: string;
  title: string;
  description: string | null;
  type: string;
}

export interface MemberLevel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rank: number;
  priceCent: number;
  discountPercent: number | null;
  benefits?: MemberBenefit[];
}

export interface CurrentMembership {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  level: MemberLevel;
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
