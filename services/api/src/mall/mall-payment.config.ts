import { InternalServerErrorException } from "@nestjs/common";

export function isMallMockPaymentEnabled(): boolean {
  return (
    process.env.WECHAT_PAY_MODE === "mock" ||
    process.env.PAYMENT_MODE === "mock" ||
    process.env.MALL_PAYMENT_MODE === "mock" ||
    process.env.MALL_MOCK_PAYMENT_ENABLED === "true" ||
    process.env.WECHAT_PAY_MOCK === "true"
  );
}

export function isMallMockRefundEnabled(): boolean {
  return (
    process.env.WECHAT_PAY_MODE === "mock" ||
    process.env.PAYMENT_MODE === "mock" ||
    process.env.MALL_REFUND_MODE === "mock" ||
    process.env.MALL_MOCK_REFUND_ENABLED === "true" ||
    process.env.WECHAT_PAY_MOCK === "true"
  );
}

export function isMallWechatRefundConfigured(): boolean {
  return process.env.WECHAT_PAY_MODE === "real" && (process.env.WECHAT_PAY_REFUND_ENABLED === "true" || process.env.MALL_WECHAT_REFUND_ENABLED === "true");
}

export function readMallWechatNotifyUrl(registrationNotifyUrl: string): string {
  const explicit = process.env.WECHAT_PAY_MALL_NOTIFY_URL?.trim();
  const value = explicit || deriveMallNotifyUrl(registrationNotifyUrl);
  validateMallNotifyUrl(value);
  return value;
}

function deriveMallNotifyUrl(registrationNotifyUrl: string): string {
  return registrationNotifyUrl.replace(/\/payments\/wechat\/notify$/, "/mall/payments/wechat/notify");
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
