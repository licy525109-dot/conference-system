import { invitationShare, type PublicInvitation } from "@conference/shared";

interface WechatSdk {
  config(config: Record<string, unknown>): void;
  ready(callback: () => void): void;
  error(callback: () => void): void;
  updateAppMessageShareData(config: Record<string, unknown>): void;
  updateTimelineShareData(config: Record<string, unknown>): void;
}
declare global {
  interface Window {
    wx?: WechatSdk;
  }
}
let sdkLoading: Promise<WechatSdk> | undefined;
function loadSdk(): Promise<WechatSdk> {
  if (window.wx) return Promise.resolve(window.wx);
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<WechatSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("微信组件加载超时"));
    }, 12000);
    script.onload = () => {
      clearTimeout(timer);
      window.wx ? resolve(window.wx) : reject(new Error("微信组件暂不可用"));
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("微信组件暂不可用"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkLoading = undefined;
    throw error;
  });
  return sdkLoading;
}
export async function configureInvitationShare(
  apiBase: string,
  token: string,
  invitation: PublicInvitation,
): Promise<WechatSdk> {
  const response = await fetch(
    `${apiBase}/invitations/${encodeURIComponent(token)}/wechat?url=${encodeURIComponent(window.location.href.split("#")[0])}`,
    { cache: "no-store", signal: AbortSignal.timeout(12000) },
  );
  const payload = await response.json();
  if (!response.ok || !payload.data?.available)
    throw new Error(payload.data?.message || "微信分享暂不可用");
  const wx = await loadSdk();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("微信分享初始化超时")),
      12000,
    );
    wx.ready(() => {
      clearTimeout(timer);
      resolve();
    });
    wx.error(() => {
      clearTimeout(timer);
      reject(new Error("微信分享配置校验未通过"));
    });
    wx.config({
      debug: false,
      appId: payload.data.appId,
      timestamp: payload.data.timestamp,
      nonceStr: payload.data.nonceStr,
      signature: payload.data.signature,
      jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
      openTagList: ["wx-open-launch-weapp"],
    });
  });
  updateInvitationShare(wx, invitation);
  return wx;
}
export function updateInvitationShare(
  wx: WechatSdk,
  invitation: PublicInvitation,
): void {
  const resolved = invitationShare(invitation);
  const share = {
    title: resolved.title,
    desc: resolved.description,
    link: resolved.url,
    imgUrl: resolved.imageUrl,
  };
  wx.updateAppMessageShareData(share);
  wx.updateTimelineShareData({
    title: share.title,
    link: share.link,
    imgUrl: share.imgUrl,
  });
}
