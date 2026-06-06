import { API_BASE_URL } from "@/config/app";
import { getToken } from "./session";

interface ApiEnvelope<T> {
  code?: string;
  message?: string;
  data?: T;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  data?: unknown;
  auth?: boolean;
}

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method: options.method ?? "GET",
      data: options.data as UniApp.RequestOptions["data"],
      header: headers,
      success: (response) => {
        const statusCode = response.statusCode;
        const body = response.data as ApiEnvelope<T> | undefined;

        if (statusCode >= 200 && statusCode < 300 && body?.code === "OK") {
          resolve(body.data as T);
          return;
        }

        const message = body?.message || `请求失败 (${statusCode})`;
        reject(new Error(message));
      },
      fail: (error) => {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}
