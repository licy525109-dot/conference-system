import { InternalServerErrorException } from "@nestjs/common";

export type MallPaymentMode = "disabled" | "mock" | "wechat";
export type MallRefundMode = "disabled" | "mock" | "wechat";

export interface MallPaymentRuntimeConfig {
  mode?: string | null;
  notifyUrl?: string | null;
  allowMockPayment?: boolean | null;
}

export interface ResolvedMallPaymentRuntime {
  mode: MallPaymentMode;
  notifyUrl: string | null;
  wechatEnabled: boolean;
  mockEnabled: boolean;
  paymentEnabled: boolean;
  source: "DB" | "ENV";
  unavailableReason: string | null;
}

export function readMallPaymentMode(config?: MallPaymentRuntimeConfig | null): MallPaymentMode {
  const mode = (config ? config.mode : process.env.MALL_PAYMENT_MODE)?.trim().toLowerCase();
  if (mode === "mock" || mode === "wechat") return mode;
  return "disabled";
}

export function resolveMallPaymentRuntime(config?: MallPaymentRuntimeConfig | null): ResolvedMallPaymentRuntime {
  const source: "DB" | "ENV" = config ? "DB" : "ENV";
  const mode = readMallPaymentMode(config);
  const notifyUrl = (config?.notifyUrl ?? process.env.WECHAT_PAY_MALL_NOTIFY_URL ?? "").trim() || null;
  const wechatEnabled = mode === "wechat" && Boolean(notifyUrl);
  const mockEnabled = config ? mode === "mock" && config.allowMockPayment === true : mode === "mock" || process.env.MALL_MOCK_PAYMENT_ENABLED === "true";
  const paymentEnabled = wechatEnabled || mockEnabled;
  return {
    mode,
    notifyUrl,
    wechatEnabled,
    mockEnabled,
    paymentEnabled,
    source,
    unavailableReason: paymentEnabled ? null : buildUnavailableReason(mode, notifyUrl, source)
  };
}

export function isMallWechatPaymentEnabled(config?: MallPaymentRuntimeConfig | null): boolean {
  return resolveMallPaymentRuntime(config).wechatEnabled;
}

export function isMallMockPaymentEnabled(config?: MallPaymentRuntimeConfig | null): boolean {
  return resolveMallPaymentRuntime(config).mockEnabled;
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

export function readMallWechatNotifyUrl(config?: MallPaymentRuntimeConfig | null): string {
  const value = (config?.notifyUrl ?? process.env.WECHAT_PAY_MALL_NOTIFY_URL)?.trim();
  if (!value) {
    throw new InternalServerErrorException("WECHAT_PAY_MALL_NOTIFY_URL is required when MALL_PAYMENT_MODE=wechat");
  }
  validateMallNotifyUrl(value);
  return value;
}

export function validateMallNotifyUrl(value: string): void {
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

function buildUnavailableReason(mode: MallPaymentMode, notifyUrl: string | null, source: "DB" | "ENV"): string {
  if (mode === "wechat" && !notifyUrl) return "商城微信支付未配置专用回调地址 WECHAT_PAY_MALL_NOTIFY_URL 或后台 notifyUrl。";
  if (mode === "mock") return source === "DB" ? "后台未勾选允许商城 mock 支付，生产默认不开放 mock。" : "MALL_MOCK_PAYMENT_ENABLED 未开启。";
  return "商城支付未启用，生产默认保持 disabled。";
}
