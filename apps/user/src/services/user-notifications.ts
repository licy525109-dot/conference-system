import { ensureLogin } from "./auth";
import { request } from "./request";

export interface UserNotificationScheduleItem {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  role: string | null;
  tableNo: string | null;
  isTableLeader: boolean;
  shareTopic: string | null;
  notes: string | null;
}

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  route: string | null;
  payloadJson: {
    conferenceId?: string;
    conferenceTitle?: string;
    publishedAt?: string;
    assignmentIds?: string[];
    items?: UserNotificationScheduleItem[];
    registrationId?: string;
    orderNo?: string;
    attendeeName?: string;
    paidAmountCent?: number;
    paymentProvider?: string;
    complimentary?: boolean;
    refundId?: string;
    refundNo?: string;
    sourceType?: "REGISTRATION" | "MALL";
    amountCent?: number;
    status?: string;
    statusLabel?: string;
    reason?: string;
  } | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotificationList {
  items: UserNotification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export async function getMyNotifications(unreadOnly = false): Promise<UserNotificationList> {
  await ensureLogin();
  return request<UserNotificationList>(`/notifications/my?unreadOnly=${unreadOnly ? "true" : "false"}`, {
    method: "GET",
    auth: true
  });
}

export function getUnreadNotificationCount(): Promise<{ count: number }> {
  return request<{ count: number }>("/notifications/unread-count", { method: "GET", auth: true });
}

export function markNotificationRead(id: string): Promise<{ id: string; readAt: string }> {
  return request<{ id: string; readAt: string }>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    auth: true
  });
}

export function markAllNotificationsRead(): Promise<{ count: number; readAt: string }> {
  return request<{ count: number; readAt: string }>("/notifications/read-all", {
    method: "PATCH",
    auth: true
  });
}
