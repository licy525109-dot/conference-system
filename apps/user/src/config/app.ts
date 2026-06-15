const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export type PaymentMode = "mock" | "wechat";

let defaultApiBaseUrl = "http://localhost:3001/api";

// #ifdef MP-WEIXIN
defaultApiBaseUrl = "http://127.0.0.1:3001/api";
// #endif

export const API_BASE_URL = env?.VITE_MP_WEIXIN_API_BASE_URL ?? env?.VITE_API_BASE_URL ?? defaultApiBaseUrl;
export const PAYMENT_MODE: PaymentMode = env?.VITE_USER_PAYMENT_MODE === "wechat" || env?.VITE_PAYMENT_MODE === "wechat" ? "wechat" : "mock";

export const MOCK_LOGIN_CODE = "dev-user-001";
export const MOCK_LOGIN_NICKNAME = "测试用户";
