import { MOCK_LOGIN_CODE, MOCK_LOGIN_NICKNAME } from "@/config/app";
import { request } from "./request";
import { getToken, setAuthSession } from "./session";

export interface CurrentUser {
  id: string;
  openid: string | null;
  nickname: string | null;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export { getStoredUser, getToken, setAuthSession } from "./session";

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
  return data;
}

export const mockLogin = loginWithWechat;

export async function ensureLogin(): Promise<string> {
  const existingToken = getToken();
  if (existingToken) {
    return existingToken;
  }

  const login = await loginWithWechat();
  return login.token;
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
        if (result.code) {
          resolve(result.code);
          return;
        }

        reject(new Error("wx.login did not return code"));
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "wx.login failed"));
      }
    });
  });
}
