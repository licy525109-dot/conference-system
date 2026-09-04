import { MOCK_LOGIN_CODE, MOCK_LOGIN_NICKNAME, PAYMENT_MODE } from "@/config/app";
import { readUniErrMsg } from "@/utils/uniErrors";
import { ApiRequestError, request, setAuthRecoveryHandler } from "./request";
import {
  clearAuthSession as clearStoredAuthSession,
  getStoredUser,
  getToken,
  setAuthSession as setStoredAuthSession
} from "./session";

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

const LOGIN_VALIDATION_TTL_MS = 60 * 1000;
let loginInFlight: Promise<LoginResponse> | null = null;
let validationInFlight: Promise<CurrentUser> | null = null;
let lastValidatedAt = 0;

export { getStoredUser, getToken } from "./session";

export const EXPIRED_LOGIN_REENTRY_MESSAGE = "微信登录未完成，请重新登录后继续。";

export async function loginWithWechat(): Promise<LoginResponse> {
  if (loginInFlight) return loginInFlight;

  loginInFlight = performWechatLogin().finally(() => {
    loginInFlight = null;
  });
  return loginInFlight;
}

async function performWechatLogin(): Promise<LoginResponse> {
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

export async function ensureAuthenticatedUser(options: { force?: boolean } = {}): Promise<CurrentUser> {
  await ensureLogin();
  const storedUser = getStoredUser();
  if (!options.force && storedUser && Date.now() - lastValidatedAt < LOGIN_VALIDATION_TTL_MS) {
    return storedUser;
  }
  if (validationInFlight) return validationInFlight;

  validationInFlight = getMe()
    .then((user) => {
      const currentToken = getToken();
      if (currentToken) {
        setAuthSession(currentToken, user);
      }
      return user;
    })
    .finally(() => {
      validationInFlight = null;
    });
  return validationInFlight;
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

export function setAuthSession(token: string, user: CurrentUser): void {
  setStoredAuthSession(token, user);
  lastValidatedAt = Date.now();
}

export function clearAuthSession(): void {
  clearStoredAuthSession();
  lastValidatedAt = 0;
}

export function isAuthSessionExpiredError(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) {
    return false;
  }
  if (err.statusCode === 401) return true;
  if (err.statusCode !== 403) return false;

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

setAuthRecoveryHandler(async () => {
  await refreshLogin();
});
