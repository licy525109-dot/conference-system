type AppEnv = {
  MODE?: string;
  PROD?: boolean;
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_MP_WEIXIN_API_BASE_URL?: string;
  VITE_PAYMENT_MODE?: string;
  VITE_USER_PAYMENT_MODE?: string;
  VITE_ENABLE_VCONSOLE?: string;
};

const env = (import.meta as ImportMeta & { env?: AppEnv }).env;

export type PaymentMode = "mock" | "real";

const isProduction = env?.PROD === true || env?.MODE === "production";
const isDevelopment = env?.DEV === true || env?.MODE === "development";
const missingApiBaseUrlMessage =
  "Missing VITE_API_BASE_URL. Set it in .env.local for local development or apps/user/.env.production for production builds.";

let apiBaseUrl = readOptionalEnv(env?.VITE_API_BASE_URL);
let paymentMode: PaymentMode = readPaymentMode(env, isProduction ? "real" : "mock");

// #ifdef MP-WEIXIN
apiBaseUrl = readOptionalEnv(env?.VITE_MP_WEIXIN_API_BASE_URL) ?? readOptionalEnv(env?.VITE_API_BASE_URL);
// #endif

// #ifndef MP-WEIXIN
if (!apiBaseUrl && isDevelopment) {
  apiBaseUrl = "http://localhost:3001/api";
}
// #endif

if (!apiBaseUrl) {
  throw new Error(missingApiBaseUrlMessage);
}

export const API_BASE_URL = apiBaseUrl;
export const PAYMENT_MODE: PaymentMode = paymentMode;
export const ENABLE_VCONSOLE = env?.VITE_ENABLE_VCONSOLE === "true";

export const MOCK_LOGIN_CODE = "dev-user-001";
export const MOCK_LOGIN_NICKNAME = "测试用户";

function readPaymentMode(envValue: AppEnv | undefined, fallback: PaymentMode): PaymentMode {
  const value = envValue?.VITE_PAYMENT_MODE ?? envValue?.VITE_USER_PAYMENT_MODE;
  if (value === "real" || value === "wechat") {
    return "real";
  }
  if (value === "mock") {
    return "mock";
  }

  return fallback;
}

function readOptionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
