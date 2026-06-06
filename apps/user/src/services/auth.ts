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

export async function mockLogin(): Promise<LoginResponse> {
  // TODO: Replace mock code with platform-isolated wx.login/code2Session flow when real WeChat login is enabled.
  const data = await request<LoginResponse>("/auth/wechat/login", {
    method: "POST",
    data: {
      code: MOCK_LOGIN_CODE,
      nickname: MOCK_LOGIN_NICKNAME
    },
    auth: false
  });
  setAuthSession(data.token, data.user);
  return data;
}

export async function ensureLogin(): Promise<string> {
  const existingToken = getToken();
  if (existingToken) {
    return existingToken;
  }

  const login = await mockLogin();
  return login.token;
}

export async function getMe(): Promise<CurrentUser> {
  const data = await request<{ user: CurrentUser }>("/auth/me", {
    method: "GET",
    auth: true
  });
  return data.user;
}
