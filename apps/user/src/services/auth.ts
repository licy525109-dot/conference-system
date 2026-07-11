import { MOCK_LOGIN_CODE, MOCK_LOGIN_NICKNAME, PAYMENT_MODE } from "@/config/app";
import { readUniErrMsg } from "@/utils/uniErrors";
import { ApiRequestError, request } from "./request";
import { clearAuthSession, getStoredUser, getToken, setAuthSession } from "./session";

export interface CurrentUser {
  id: string;
  openid: string | null;
  nickname: string | null;
  phone?: string | null;
  wechatNickname?: string | null;
  wechatAvatarUrl?: string | null;
  registeredAt?: string;
  lastActiveAt?: string | null;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export { clearAuthSession, getStoredUser, getToken, setAuthSession } from "./session";

export const EXPIRED_LOGIN_REENTRY_MESSAGE = "登录状态已过期，请返回首页重新进入小程序下单。";

export async function loginWithWechat(): Promise<LoginResponse> {
  const code = await getPlatformLoginCode();
  const payload: { code: string; nickname?: string } = { code };

  // #ifndef MP-WEIXIN
  payload.nickname = MOCK_LOGIN_NICKNAME;
  // #endif

  const data = await request<LoginResponse>("/auth/wechat/login", {
    method: "POST",
    data: payload,
    auth: false
  });
  setAuthSession(data.token, data.user);
  uni.$emit("auth:changed", data.user);
  return data;
}

export const mockLogin = loginWithWechat;

export async function ensureLogin(): Promise<string> {
  const existingToken = getToken();
  if (existingToken) {
    if (PAYMENT_MODE === "real" && !hasRealOpenid(getStoredUser())) {
      clearAuthSession();
    } else {
      return existingToken;
    }
  }

  const login = await loginWithWechat();
  return login.token;
}

function hasRealOpenid(user: CurrentUser | null): boolean {
  if (!user?.openid) {
    return false;
  }

  return !user.openid.startsWith("mock_");
}

export async function refreshLogin(): Promise<string> {
  clearAuthSession();
  const login = await loginWithWechat();
  return login.token;
}

export function isAuthSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof ApiRequestError) || (err.statusCode !== 401 && err.statusCode !== 403)) {
    return false;
  }

  const message = `${err.responseMessage || ""} ${err.message || ""}`;
  return (
    message.includes("登录状态已过期") ||
    message.includes("登录状态已失效") ||
    message.includes("mock") ||
    message.includes("openid") ||
    message.includes("当前订单未绑定有效微信身份")
  );
}

export function clearExpiredAuthSession(): void {
  clearAuthSession();
}

export async function getMe(): Promise<CurrentUser> {
  const data = await request<{ user: CurrentUser }>("/auth/me", {
    method: "GET",
    auth: true
  });
  return data.user;
}

function getPlatformLoginCode(): Promise<string> {
  // #ifdef MP-WEIXIN
  return getMiniProgramLoginCode();
  // #endif

  return Promise.resolve(MOCK_LOGIN_CODE);
}

function getMiniProgramLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      success: (result) => {
        if (result?.code) {
          resolve(result.code);
          return;
        }

        reject(new Error("wx.login did not return code"));
      },
      fail: (error) => {
        reject(new Error(readUniErrMsg(error, "wx.login failed")));
      }
    });
  });
}
