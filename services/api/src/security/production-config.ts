const PLACEHOLDER_VALUES = [
  "change-me",
  "change_me",
  "replace-with",
  "replace_with",
  "dev_jwt_secret",
  "conference_dev_password"
];

export function assertProductionConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const errors: string[] = [];
  requireValue(errors, env, "DATABASE_URL");
  const jwtSecret = env.JWT_SECRET?.trim() ?? "";
  if (jwtSecret.length < 32 || PLACEHOLDER_VALUES.some((value) => jwtSecret.toLowerCase().includes(value))) {
    errors.push("JWT_SECRET must be a non-placeholder secret of at least 32 characters");
  }
  const configEncryptionKey = env.WECOM_CONFIG_ENCRYPTION_KEY?.trim() ?? "";
  if (configEncryptionKey.length < 32 || isPlaceholder(configEncryptionKey)) {
    errors.push("WECOM_CONFIG_ENCRYPTION_KEY must be a non-placeholder secret of at least 32 characters");
  }
  if (env.WECHAT_LOGIN_MODE !== "real") {
    errors.push("WECHAT_LOGIN_MODE must be real");
  }
  requireValue(errors, env, "WECHAT_APP_ID");
  requireValue(errors, env, "WECHAT_APP_SECRET");
  const corsOrigins = splitOrigins(env.CORS_ALLOWED_ORIGINS);
  if (!corsOrigins.length) {
    errors.push("CORS_ALLOWED_ORIGINS must contain the production admin/H5 origins");
  } else if (corsOrigins.some((origin) => origin === "*" || !isHttpsOrigin(origin))) {
    errors.push("CORS_ALLOWED_ORIGINS must contain only explicit HTTPS origins");
  }
  if (env.WECHAT_PAY_MODE !== "real" || env.WECHAT_PAY_MOCK === "true" || env.PAYMENT_MODE === "mock" || env.WECHAT_PAY_ENABLED === "false") {
    errors.push("registration WeChat Pay must run in real mode");
  } else {
    requireValue(errors, env, "WECHAT_PAY_APP_ID", env.WECHAT_APP_ID);
    requireValue(errors, env, "WECHAT_PAY_MCH_ID");
    requireValue(errors, env, "WECHAT_PAY_MCH_SERIAL_NO", env.WECHAT_PAY_SERIAL_NO || env.WECHAT_PAY_CERT_SERIAL_NO);
    requireValue(errors, env, "WECHAT_PAY_NOTIFY_URL");
    requireValue(errors, env, "WECHAT_PAY_PRIVATE_KEY_PATH");
    requireValue(errors, env, "WECHAT_PAY_API_V3_KEY");
    requireValue(errors, env, "WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH");
    if (!(env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID?.trim() || env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO?.trim())) {
      errors.push("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID or WECHAT_PAY_PLATFORM_CERT_SERIAL_NO is required");
    }
    if (env.WECHAT_PAY_API_V3_KEY && Buffer.byteLength(env.WECHAT_PAY_API_V3_KEY, "utf8") !== 32) {
      errors.push("WECHAT_PAY_API_V3_KEY must be exactly 32 bytes");
    }
    if (env.WECHAT_PAY_NOTIFY_URL && !isHttpsUrl(env.WECHAT_PAY_NOTIFY_URL)) {
      errors.push("WECHAT_PAY_NOTIFY_URL must be an HTTPS URL");
    }
    requireReadableFile(errors, env.WECHAT_PAY_PRIVATE_KEY_PATH, "WECHAT_PAY_PRIVATE_KEY_PATH");
    requireReadableFile(errors, env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH, "WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH");
  }
  if (env.ORDER_EXPIRY_WORKER_ENABLED === "false") {
    errors.push("ORDER_EXPIRY_WORKER_ENABLED must not be false in production because pending orders reserve inventory");
  }
  if (env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED === "true" && env.NOTIFICATION_TASK_WORKER_ENABLED === "false") {
    errors.push("NOTIFICATION_TASK_WORKER_ENABLED must not be false while WeChat subscription messages are enabled");
  }
  if (env.MALL_PAYMENT_MODE === "mock" || env.MALL_MOCK_PAYMENT_ENABLED === "true") {
    errors.push("mall mock payment must be disabled");
  }
  if (env.MALL_PAYMENT_MODE === "wechat" && !isHttpsUrl(env.WECHAT_PAY_MALL_NOTIFY_URL ?? "")) {
    errors.push("MALL_PAYMENT_MODE=wechat requires an HTTPS WECHAT_PAY_MALL_NOTIFY_URL");
  }
  if (env.REFUND_MODE === "mock" || env.MOCK_REFUND_ENABLED === "true") {
    errors.push("registration mock refund must be disabled");
  }
  if (env.REFUND_ENABLED === "true" && (env.REFUND_MODE !== "wechat" || !isHttpsUrl(env.WECHAT_PAY_REFUND_NOTIFY_URL ?? ""))) {
    errors.push("enabled registration refunds require REFUND_MODE=wechat and an HTTPS WECHAT_PAY_REFUND_NOTIFY_URL");
  }
  if (env.REFUND_ENABLED === "true" && env.REFUND_REQUIRES_APPROVAL === "false") {
    errors.push("REFUND_REQUIRES_APPROVAL must remain true because automatic registration refund approval is not supported");
  }
  if (env.MALL_REFUND_MODE === "mock" || env.MALL_MOCK_REFUND_ENABLED === "true") {
    errors.push("mall mock refund must be disabled");
  }
  if ((env.MALL_REFUND_MODE === "wechat" || env.MALL_WECHAT_REFUND_ENABLED === "true") && !isHttpsUrl(env.WECHAT_PAY_REFUND_NOTIFY_URL ?? "")) {
    errors.push("enabled mall refunds require an HTTPS WECHAT_PAY_REFUND_NOTIFY_URL");
  }
  if ((env.MALL_REFUND_MODE === "wechat" || env.MALL_WECHAT_REFUND_ENABLED === "true") && env.MALL_REFUND_REQUIRES_APPROVAL === "false") {
    errors.push("MALL_REFUND_REQUIRES_APPROVAL must remain true because automatic mall refund approval is not supported");
  }
  const publicApiBaseUrl = env.PUBLIC_API_BASE_URL?.trim();
  if (!publicApiBaseUrl || !isHttpsUrl(publicApiBaseUrl)) {
    errors.push("PUBLIC_API_BASE_URL must be a public HTTPS URL");
  }

  if (errors.length) {
    throw new Error(`Unsafe production configuration: ${errors.join("; ")}`);
  }
}

export function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value.replace(/\/$/, "") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function requireValue(errors: string[], env: NodeJS.ProcessEnv, name: string, fallback?: string): void {
  const value = env[name]?.trim() || fallback?.trim();
  if (!value || isPlaceholder(value)) errors.push(`${name} is required and must not use a placeholder in production`);
}

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_VALUES.some((placeholder) => normalized.includes(placeholder))
    || normalized.includes("your-domain")
    || normalized.includes("/path/to/");
}

function requireReadableFile(errors: string[], path: string | undefined, name: string): void {
  if (!path?.trim()) return;
  try {
    accessSync(path, constants.R_OK);
  } catch {
    errors.push(`${name} must point to a readable file`);
  }
}
import { accessSync, constants } from "node:fs";
