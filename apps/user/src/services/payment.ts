import { PAYMENT_MODE } from "@/config/app";
import { readUniErrMsg } from "@/utils/uniErrors";
import { ensureLogin } from "./auth";
import { request } from "./request";

export interface MockPaymentConfirmResponse {
  orderNo: string;
  orderStatus: "PAID";
  paymentStatus: "SUCCESS";
  registrationId: string;
}

export interface PaymentStatusResponse {
  orderNo: string;
  status: "PENDING" | "PAID" | "CANCELLED" | "CLOSED" | "REFUNDED";
  paidAt: string | null;
  paymentProvider?: "MOCK" | "WECHAT" | null;
  paymentStatus?: "PENDING" | "SUCCESS" | "FAILED" | "CLOSED" | null;
  registrationId: string | null;
}

export interface WechatPrepayResponse {
  orderNo: string;
  outTradeNo: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
}

export function confirmMockPayment(orderNo: string): Promise<MockPaymentConfirmResponse> {
  return request<MockPaymentConfirmResponse>("/payments/mock/confirm", {
    method: "POST",
    data: { orderNo },
    auth: true
  });
}

export function getPaymentStatus(orderNo: string): Promise<PaymentStatusResponse> {
  return request<PaymentStatusResponse>(`/orders/${encodeURIComponent(orderNo)}/payment-status`, {
    method: "GET",
    auth: true
  });
}

export function prepayWechatPayment(orderNo: string): Promise<WechatPrepayResponse> {
  return request<WechatPrepayResponse>("/payments/wechat/prepay", {
    method: "POST",
    data: { orderNo },
    auth: true
  });
}

export async function startOrderPayment(orderNo: string): Promise<PaymentStatusResponse> {
  await ensureLogin();

  // #ifndef MP-WEIXIN
  if (PAYMENT_MODE === "mock") {
    await confirmMockPayment(orderNo);
    return pollPaidStatus(orderNo);
  }
  // #endif

  // #ifdef MP-WEIXIN
  const prepay = await prepayWechatPayment(orderNo);
  await requestMiniProgramPayment(prepay);
  return pollPaidStatus(orderNo);
  // #endif

  // #ifndef MP-WEIXIN
  throw new Error("当前平台暂不支持真实微信支付");
  // #endif
}

export function getPaymentActionLabel(): string {
  // #ifdef MP-WEIXIN
  return "微信支付";
  // #endif

  // #ifndef MP-WEIXIN
  if (PAYMENT_MODE === "mock") {
    return "模拟支付";
  }

  return "微信支付";
  // #endif
}

function requestMiniProgramPayment(input: WechatPrepayResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.requestPayment({
      provider: "wxpay",
      timeStamp: input.timeStamp,
      nonceStr: input.nonceStr,
      package: input.package,
      signType: input.signType,
      paySign: input.paySign,
      success: () => resolve(),
      fail: (error) => reject(new Error(readUniErrMsg(error, "微信支付失败")))
    });
  });
}

async function pollPaidStatus(orderNo: string): Promise<PaymentStatusResponse> {
  let lastStatus: PaymentStatusResponse | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) {
      await delay(1500);
    }

    lastStatus = await getPaymentStatus(orderNo);
    if (lastStatus.status === "PAID" && lastStatus.registrationId) {
      return lastStatus;
    }
  }

  throw new Error(lastStatus?.status === "PAID" ? "报名记录生成中，请稍后刷新" : "支付结果确认中，请稍后刷新");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
