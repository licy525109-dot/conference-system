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
  // #ifdef MP-WEIXIN
  const prepay = await prepayWechatPayment(orderNo);
  await requestMiniProgramPayment(prepay);
  return pollPaidStatus(orderNo);
  // #endif

  // #ifndef MP-WEIXIN
  await confirmMockPayment(orderNo);
  return getPaymentStatus(orderNo);
  // #endif
}

export function getPaymentActionLabel(): string {
  // #ifdef MP-WEIXIN
  return "微信支付";
  // #endif

  // #ifndef MP-WEIXIN
  return "开发环境 mock 支付成功";
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
      fail: (error) => reject(new Error(error.errMsg || "微信支付失败"))
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
