import { readFileSync } from "node:fs";
import { InternalServerErrorException } from "@nestjs/common";

export interface WechatPayConfig {
  appId: string;
  mchId: string;
  mchSerialNo: string;
  apiV3Key: string;
  privateKeyPem: string;
  notifyUrl: string;
}

export function isWechatPayEnabled(): boolean {
  if (process.env.WECHAT_PAY_MODE === "mock" || process.env.WECHAT_PAY_ENABLED === "false") {
    return false;
  }

  return process.env.WECHAT_PAY_MODE === "real" || process.env.WECHAT_PAY_ENABLED === "true";
}

export function readWechatPayConfig(): WechatPayConfig {
  const notifyUrl = readRequiredEnv("WECHAT_PAY_NOTIFY_URL");
  validateNotifyUrl(notifyUrl);

  return {
    appId: readRequiredEnv("WECHAT_PAY_APP_ID"),
    mchId: readRequiredEnv("WECHAT_PAY_MCH_ID"),
    mchSerialNo: readRequiredEnv("WECHAT_PAY_MCH_SERIAL_NO"),
    apiV3Key: readRequiredEnv("WECHAT_PAY_API_V3_KEY"),
    privateKeyPem: readPrivateKey(readRequiredEnv("WECHAT_PAY_PRIVATE_KEY_PATH")),
    notifyUrl
  };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`${name} is not configured for WeChat Pay`);
  }

  return value;
}

function readPrivateKey(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new InternalServerErrorException("WECHAT_PAY_PRIVATE_KEY_PATH cannot be read");
  }
}

function validateNotifyUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InternalServerErrorException("WECHAT_PAY_NOTIFY_URL must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:" || url.search.length > 0) {
    throw new InternalServerErrorException("WECHAT_PAY_NOTIFY_URL must be HTTPS and must not include query");
  }
}
