import { API_BASE_URL } from "@/config/app";
import type { CurrentUser } from "./auth";
import { getToken, setAuthSession } from "./session";
import { request } from "./request";

interface ProfileResponse {
  user: CurrentUser;
}

interface AvatarUploadResponse extends ProfileResponse {
  avatarUrl: string;
}

interface ApiEnvelope<T> {
  code?: string;
  message?: string;
  data?: T;
}

export function getWechatProfile(): Promise<CurrentUser> {
  return request<ProfileResponse>("/auth/me", {
    method: "GET",
    auth: true
  }).then((data) => data.user);
}

export async function updateWechatProfile(input: {
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
}): Promise<CurrentUser> {
  const data = await request<ProfileResponse>("/auth/me/profile", {
    method: "PATCH",
    auth: true,
    data: input
  });
  cacheUser(data.user);
  return data.user;
}

export function uploadWechatAvatar(filePath: string): Promise<string> {
  const token = getToken();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${API_BASE_URL}/auth/me/avatar`,
      filePath,
      name: "file",
      header: token ? { Authorization: `Bearer ${token}` } : undefined,
      success: (response) => {
        const body = parseUploadResponse(response.data);
        if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === "OK" && body.data?.avatarUrl) {
          cacheUser(body.data.user);
          resolve(body.data.avatarUrl);
          return;
        }

        reject(new Error(body?.message || "头像上传失败"));
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "头像上传失败"));
      }
    });
  });
}

function cacheUser(user: CurrentUser): void {
  const token = getToken();
  if (token) {
    setAuthSession(token, user);
  }
}

function parseUploadResponse(value: string): ApiEnvelope<AvatarUploadResponse> | null {
  try {
    return JSON.parse(value) as ApiEnvelope<AvatarUploadResponse>;
  } catch {
    return null;
  }
}
