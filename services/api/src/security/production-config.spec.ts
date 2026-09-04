import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { assertProductionConfiguration } from "./production-config";

const readableFile = resolve(__dirname, "../../../../package.json");

describe("assertProductionConfiguration", () => {
  it("does not constrain local development", () => {
    assert.doesNotThrow(() => assertProductionConfiguration({ NODE_ENV: "development" }));
  });

  it("accepts a complete fail-closed production payment configuration", () => {
    assert.doesNotThrow(() => assertProductionConfiguration(validProductionEnv()));
  });

  it("rejects mock or incomplete production payment configuration", () => {
    const env = validProductionEnv();
    env.WECHAT_PAY_MODE = "mock";
    delete env.WECHAT_PAY_MCH_ID;

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WeChat Pay must run in real mode/.test(error.message)
    );
  });

  it("rejects the legacy mock payment alias in production", () => {
    const env = validProductionEnv();
    env.PAYMENT_MODE = "mock";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WeChat Pay must run in real mode/.test(error.message)
    );
  });

  it("requires real mini program credentials before production can start", () => {
    const env = validProductionEnv();
    delete env.WECHAT_APP_SECRET;

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WECHAT_APP_SECRET/.test(error.message)
    );
  });

  it("requires a dedicated production configuration encryption key", () => {
    const env = validProductionEnv();
    delete env.WECOM_CONFIG_ENCRYPTION_KEY;

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WECOM_CONFIG_ENCRYPTION_KEY/.test(error.message)
    );
  });

  it("requires inventory expiry processing and notification delivery workers", () => {
    const orderWorkerDisabled = validProductionEnv();
    orderWorkerDisabled.ORDER_EXPIRY_WORKER_ENABLED = "false";
    assert.throws(
      () => assertProductionConfiguration(orderWorkerDisabled),
      (error: unknown) => error instanceof Error && /ORDER_EXPIRY_WORKER_ENABLED/.test(error.message)
    );

    const notificationWorkerDisabled = validProductionEnv();
    notificationWorkerDisabled.WECHAT_SUBSCRIBE_MESSAGE_ENABLED = "true";
    notificationWorkerDisabled.NOTIFICATION_TASK_WORKER_ENABLED = "false";
    assert.throws(
      () => assertProductionConfiguration(notificationWorkerDisabled),
      (error: unknown) => error instanceof Error && /NOTIFICATION_TASK_WORKER_ENABLED/.test(error.message)
    );
  });

  it("rejects placeholder production credentials", () => {
    const env = validProductionEnv();
    env.WECHAT_APP_SECRET = "replace-with-your-wechat-app-secret";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WECHAT_APP_SECRET/.test(error.message)
    );
  });

  it("rejects wildcard or non-HTTPS browser origins", () => {
    const env = validProductionEnv();
    env.CORS_ALLOWED_ORIGINS = "*,http://admin.example.com";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /explicit HTTPS origins/.test(error.message)
    );
  });

  it("requires the verified refund callback when self-service refunds are enabled", () => {
    const env = validProductionEnv();
    env.REFUND_ENABLED = "true";
    env.REFUND_MODE = "wechat";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WECHAT_PAY_REFUND_NOTIFY_URL/.test(error.message)
    );
  });

  it("requires the verified refund callback when mall refunds are enabled", () => {
    const env = validProductionEnv();
    env.MALL_REFUND_MODE = "wechat";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /enabled mall refunds/.test(error.message)
    );
  });

  it("rejects unsupported automatic refund approval modes", () => {
    const registrationEnv = validProductionEnv();
    registrationEnv.REFUND_ENABLED = "true";
    registrationEnv.REFUND_MODE = "wechat";
    registrationEnv.WECHAT_PAY_REFUND_NOTIFY_URL = "https://api.example.com/api/payments/wechat/refund-notify";
    registrationEnv.REFUND_REQUIRES_APPROVAL = "false";
    assert.throws(
      () => assertProductionConfiguration(registrationEnv),
      (error: unknown) => error instanceof Error && /REFUND_REQUIRES_APPROVAL/.test(error.message)
    );

    const mallEnv = validProductionEnv();
    mallEnv.MALL_REFUND_MODE = "wechat";
    mallEnv.WECHAT_PAY_REFUND_NOTIFY_URL = "https://api.example.com/api/payments/wechat/refund-notify";
    mallEnv.MALL_REFUND_REQUIRES_APPROVAL = "false";
    assert.throws(
      () => assertProductionConfiguration(mallEnv),
      (error: unknown) => error instanceof Error && /MALL_REFUND_REQUIRES_APPROVAL/.test(error.message)
    );
  });

  it("requires a dedicated HTTPS mall payment callback when mall payment is enabled", () => {
    const env = validProductionEnv();
    env.MALL_PAYMENT_MODE = "wechat";

    assert.throws(
      () => assertProductionConfiguration(env),
      (error: unknown) => error instanceof Error && /WECHAT_PAY_MALL_NOTIFY_URL/.test(error.message)
    );
  });
});

function validProductionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://conference:secret@db.example.com:5432/conference",
    JWT_SECRET: "a-production-jwt-secret-with-32-plus-characters",
    WECOM_CONFIG_ENCRYPTION_KEY: "a-production-config-key-with-32-plus-characters",
    WECHAT_LOGIN_MODE: "real",
    CORS_ALLOWED_ORIGINS: "https://admin.example.com,https://h5.example.com",
    PUBLIC_API_BASE_URL: "https://api.example.com/api",
    WECHAT_APP_ID: "wx-app",
    WECHAT_APP_SECRET: "wechat-app-secret",
    WECHAT_PAY_MODE: "real",
    WECHAT_PAY_MOCK: "false",
    WECHAT_PAY_APP_ID: "wx-app",
    WECHAT_PAY_MCH_ID: "1900000001",
    WECHAT_PAY_MCH_SERIAL_NO: "merchant-serial",
    WECHAT_PAY_NOTIFY_URL: "https://api.example.com/api/payments/wechat/notify",
    WECHAT_PAY_PRIVATE_KEY_PATH: readableFile,
    WECHAT_PAY_API_V3_KEY: "12345678901234567890123456789012",
    WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH: readableFile,
    WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID: "PUB_KEY_ID_test",
    MALL_PAYMENT_MODE: "disabled",
    MALL_MOCK_PAYMENT_ENABLED: "false",
    REFUND_ENABLED: "false",
    REFUND_MODE: "disabled",
    MOCK_REFUND_ENABLED: "false",
    MALL_REFUND_MODE: "disabled",
    MALL_MOCK_REFUND_ENABLED: "false"
  };
}
