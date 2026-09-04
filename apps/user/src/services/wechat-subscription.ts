import { ensureLogin } from "./auth";
import { request } from "./request";

export interface WechatSubscriptionOption {
  templateCode: string;
  templateId: string | null;
  name: string;
  purpose: string;
  page: string | null;
  enabled: boolean;
  message: string;
}

export async function getWechatSubscriptionOptions(codes: string[]): Promise<WechatSubscriptionOption[]> {
  await ensureLogin();
  const normalized = Array.from(new Set(codes.map((item) => item.trim()).filter(Boolean))).slice(0, 10);
  if (normalized.length === 0) return [];
  const query = encodeURIComponent(normalized.join(","));
  const data = await request<{ items: WechatSubscriptionOption[] }>(`/notifications/subscription-config?codes=${query}`, {
    method: "GET",
    auth: true
  });
  return data.items;
}

export async function subscribeWechatNotifications(
  options: WechatSubscriptionOption[]
): Promise<{ acceptedCodes: string[]; accepted: boolean; message: string }> {
  const available = options.filter((item) => item.enabled && item.templateId).slice(0, 3);
  if (available.length === 0) {
    return { acceptedCodes: [], accepted: false, message: "微信提醒暂未开放" };
  }

  // #ifdef MP-WEIXIN
  const templateIds = available.map((item) => item.templateId as string);
  const result = await new Promise<Record<string, string>>((resolve, reject) => {
    uni.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (response) => resolve(response as unknown as Record<string, string>),
      fail: reject
    });
  });
  const accepted = available.filter((item) => item.templateId && result[item.templateId] === "accept");
  await Promise.all(accepted.map((item) => request("/notifications/subscribe", {
    method: "POST",
    auth: true,
    data: {
      templateCode: item.templateCode,
      channel: "WECHAT_SUBSCRIBE",
      enabled: true
    }
  })));
  return {
    acceptedCodes: accepted.map((item) => item.templateCode),
    accepted: accepted.length > 0,
    message: accepted.length > 0 ? "微信结果提醒已开启" : "你暂未允许微信结果提醒"
  };
  // #endif

  // #ifndef MP-WEIXIN
  return { acceptedCodes: [], accepted: false, message: "请在微信小程序中开启提醒" };
  // #endif
}
