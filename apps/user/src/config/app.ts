const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;

export type PaymentMode = "mock" | "real";

const MP_WEIXIN_API_BASE_URL = "https://guanchaohuiji.com/api";

let defaultApiBaseUrl = "https://guanchaohuiji.com/api";
let defaultPaymentMode: PaymentMode = "real";

// #ifndef MP-WEIXIN
defaultApiBaseUrl = "http://localhost:3001/api";
defaultPaymentMode = "mock";
// #endif

let apiBaseUrl = env?.VITE_API_BASE_URL ?? defaultApiBaseUrl;
let paymentMode: PaymentMode = readPaymentMode(env, defaultPaymentMode);

// #ifdef MP-WEIXIN
apiBaseUrl = env?.VITE_MP_WEIXIN_API_BASE_URL ?? env?.VITE_API_BASE_URL ?? MP_WEIXIN_API_BASE_URL;
paymentMode = readPaymentMode(env, "real");
// #endif

export const API_BASE_URL = apiBaseUrl;
export const PAYMENT_MODE: PaymentMode = paymentMode;
export const ENABLE_VCONSOLE = env?.VITE_ENABLE_VCONSOLE === "true";

export const MOCK_LOGIN_CODE = "dev-user-001";
export const MOCK_LOGIN_NICKNAME = "测试用户";

function readPaymentMode(envValue: Record<string, string | undefined> | undefined, fallback: PaymentMode): PaymentMode {
  const value = envValue?.VITE_PAYMENT_MODE ?? envValue?.VITE_USER_PAYMENT_MODE;
  if (value === "real" || value === "wechat") {
    return "real";
  }
  if (value === "mock") {
    return "mock";
  }

  return fallback;
}
