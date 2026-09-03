import { ensureLogin } from "./auth";
import { request } from "./request";

export type GuestScheduleType = "WORKSHOP" | "DINNER" | "SPEECH" | "REHEARSAL" | "RECEPTION" | "OTHER";

export interface MyGuestScheduleItem {
  id: string;
  type: GuestScheduleType;
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
  publishedAt: string | null;
  updatedAt: string;
  attendee: {
    id: string;
    name: string;
    phone: string;
    company: string | null;
    title: string | null;
    registration: { id: string; registrationNo: string };
  };
  conference: {
    id: string;
    title: string;
    coverImageUrl: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string;
  };
}

export interface GuestScheduleSubscriptionConfig {
  templateCode: string;
  templateId: string | null;
  page: string;
  enabled: boolean;
  message: string;
}

export async function getMyGuestSchedules(conferenceId?: string): Promise<MyGuestScheduleItem[]> {
  await ensureLogin();
  const query = conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : "";
  const data = await request<{ items: MyGuestScheduleItem[]; total: number }>(`/guest-schedules/my${query}`, {
    method: "GET",
    auth: true
  });
  return data.items;
}

export async function getGuestScheduleSubscriptionConfig(): Promise<GuestScheduleSubscriptionConfig> {
  await ensureLogin();
  return request<GuestScheduleSubscriptionConfig>("/guest-schedules/subscription-config", { method: "GET", auth: true });
}

export async function subscribeGuestScheduleUpdates(
  config: GuestScheduleSubscriptionConfig
): Promise<{ accepted: boolean; message: string }> {
  if (!config.enabled || !config.templateId) return { accepted: false, message: config.message };

  // #ifdef MP-WEIXIN
  const result = await new Promise<Record<string, string>>((resolve, reject) => {
    uni.requestSubscribeMessage({
      tmplIds: [config.templateId!],
      success: (response) => resolve(response as unknown as Record<string, string>),
      fail: reject
    });
  });
  if (result[config.templateId] !== "accept") {
    return { accepted: false, message: "你暂未允许会务安排提醒，可稍后再次开启" };
  }
  await request("/notifications/subscribe", {
    method: "POST",
    auth: true,
    data: {
      templateCode: config.templateCode,
      channel: "WECHAT_SUBSCRIBE",
      enabled: true
    }
  });
  return { accepted: true, message: "已订阅下一次会务安排更新提醒" };
  // #endif

  // #ifndef MP-WEIXIN
  return { accepted: false, message: "请在微信小程序中开启会务安排提醒" };
  // #endif
}
