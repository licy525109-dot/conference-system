import { apiRequest } from "./api";

export interface UserActivity {
  user: { id: string; realName: string | null; nickname: string | null; wechatNickname: string | null;
    phone: string | null; phoneVerified: boolean; createdAt: string; lastActiveAt: string | null };
  registrations: { total: number; page: number; pageSize: number; items: Array<{
    id: string; registrationNo: string; relationship: "SUBMITTED" | "ATTENDEE" | "BUSINESS_CONTACT"; status: string; source: string;
    createdAt: string; attendeeName: string; paidAmountCent: number; refundedAmountCent: number;
    conference: { id: string; title: string; startsAt: string }; sku: { name: string };
    order: { orderNo: string; status: string; paidAt: string | null };
    attendees: Array<{ id: string; name: string; phone: string; checkInStatus: string }>;
  }> };
  orderCount: number;
  paidOrderCount: number;
}

export function getUserActivity(id: string, page = 1) {
  return apiRequest<UserActivity>(`/admin/users/${encodeURIComponent(id)}/activity?page=${page}&pageSize=20`);
}
