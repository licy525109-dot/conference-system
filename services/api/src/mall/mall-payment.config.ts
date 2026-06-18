import { InternalServerErrorException } from "@nestjs/common";

export type MallPaymentMode = "disabled" | "mock" | "wechat";
export type MallRefundMode = "disabled" | "mock" | "wechat";

export function readMallPaymentMode(): MallPaymentMode {
  const mode = process.env.MALL_PAYMENT_MODE?.trim().toLowerCase();
  if (mode === "mock" || mode === "wechat") return mode;
  return "disabled";
}

export function isMallWechatPaymentEnabled(): boolean {
  return readMallPaymentMode() === "wechat" && Boolean(process.env.WECHAT_PAY_MALL_NOTIFY_URL?.trim());
}

export function isMallMockPaymentEnabled(): boolean {
  return readMallPaymentMode() === "mock" || process.env.MALL_MOCK_PAYMENT_ENABLED === "true";
}

export function readMallRefundMode(): MallRefundMode {
  const mode = process.env.MALL_REFUND_MODE?.trim().toLowerCase();
  if (mode === "mock" || mode === "wechat") return mode;
  return "disabled";
}

export function isMallMockRefundEnabled(): boolean {
  return readMallRefundMode() === "mock" || process.env.MALL_MOCK_REFUND_ENABLED === "true";
}

export function isMallWechatRefundConfigured(): boolean {
  return readMallRefundMode() === "wechat" || process.env.MALL_WECHAT_REFUND_ENABLED === "true";
}

export function readMallWechatNotifyUrl(): string {
  const value = process.env.WECHAT_PAY_MALL_NOTIFY_URL?.trim();
  if (!value) {
    throw new InternalServerErrorException("WECHAT_PAY_MALL_NOTIFY_URL is required when MALL_PAYMENT_MODE=wechat");
  }
  validateMallNotifyUrl(value);
  return value;
}

function validateMallNotifyUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InternalServerErrorException("WECHAT_PAY_MALL_NOTIFY_URL must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:" || url.search.length > 0) {
    throw new InternalServerErrorException("WECHAT_PAY_MALL_NOTIFY_URL must be HTTPS and must not include query");
  }

  if (!url.pathname.endsWith("/mall/payments/wechat/notify")) {
    throw new InternalServerErrorException("WECHAT_PAY_MALL_NOTIFY_URL must point to /mall/payments/wechat/notify");
  }
}
