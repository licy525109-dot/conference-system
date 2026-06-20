import { readUniErrMsg } from "@/utils/uniErrors";
import { API_BASE_URL } from "@/config/app";
import { ensureLogin } from "./auth";
import type { WechatPrepayResponse } from "./payment";
import { request } from "./request";

export interface CouponClaimResult {
  campaign: { id: string; name: string; claimCode: string };
  claims: Array<Record<string, unknown>>;
}

export interface CouponCampaignPublic {
  id: string;
  name: string;
  claimCode: string;
  qrScene: string | null;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  totalLimit: number | null;
  claimedCount: number;
  claimable: boolean;
  statusText: string;
  coupons: Array<Record<string, unknown>>;
}

export function getCouponCampaignPublic(id: string) {
  return request<CouponCampaignPublic>(`/coupon-campaigns/${encodeURIComponent(id)}/public`, { auth: false });
}

export async function claimCoupon(claimCode: string) {
  await ensureLogin();
  return request<CouponClaimResult>("/coupons/claim", { method: "POST", data: { claimCode } });
}

export async function getMyCoupons() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/coupons");
}

export interface AiAnswerSource {
  id?: string;
  documentId?: string;
  documentTitle?: string;
  chunkIndex?: number;
  excerpt?: string;
}

export interface AiAskResponse {
  answer: string;
  sources: AiAnswerSource[];
  provider: string;
  model?: string;
  status?: "ANSWERED" | "FALLBACK" | "DISABLED" | "PROVIDER_NOT_CONFIGURED" | "NO_KNOWLEDGE_BASE";
  fallback?: boolean;
  hit?: boolean;
}

export interface AiSuggestionResponse {
  items: string[];
  status?: "OK" | "DISABLED" | "NO_KNOWLEDGE_BASE";
  message?: string;
}

export async function askConferenceAi(conferenceId: string, question: string) {
  await ensureLogin();
  return request<AiAskResponse>(`/conferences/${encodeURIComponent(conferenceId)}/ai/ask`, {
    method: "POST",
    data: { question }
  });
}

export function getConferenceAiSuggestions(conferenceId: string) {
  return request<AiSuggestionResponse>(`/conferences/${encodeURIComponent(conferenceId)}/ai/suggestions`, { auth: false });
}

export interface InvoiceProfile {
  id: string;
  title: string;
  taxNo: string | null;
  invoiceType: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function createInvoiceApplication(input: {
  sourceType?: "REGISTRATION" | "MALL";
  orderNo: string;
  title: string;
  taxNo?: string;
  invoiceType?: string;
  email?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  remark?: string;
  saveAsDefault?: boolean;
}) {
  await ensureLogin();
  return request<Record<string, unknown>>("/invoices", { method: "POST", data: input });
}

export async function getMyInvoiceProfile() {
  await ensureLogin();
  return request<{ item: InvoiceProfile | null }>("/my/invoice-profile");
}

export async function saveMyInvoiceProfile(input: Partial<InvoiceProfile> & { title: string }) {
  await ensureLogin();
  return request<InvoiceProfile>("/my/invoice-profile", { method: "POST", data: input });
}

export async function getMyInvoices() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/invoices");
}

export interface InvoiceableOrder {
  sourceType: "REGISTRATION" | "MALL";
  sourceText: string;
  orderNo: string;
  title: string;
  paidAmountCent: number;
  invoiceAppliedAmountCent: number;
  availableAmountCent: number;
  paidAt: string | null;
  status: string;
}

export async function getMyInvoiceableOrders() {
  await ensureLogin();
  return request<{ items: InvoiceableOrder[] }>("/my/invoiceable-orders");
}

export async function getMyRefunds() {
  await ensureLogin();
  return request<{ items: FinanceRefund[] }>("/my/refunds");
}

export interface FinanceRefund {
  id: string;
  sourceType: "REGISTRATION" | "MALL";
  refundNo: string;
  orderNo: string | null;
  amountCent: number;
  status: string;
  reason: string | null;
  rejectReason: string | null;
  failedReason: string | null;
  requestedAt?: string;
  createdAt: string;
  updatedAt: string;
  afterSaleStatus?: string | null;
  refundNotice?: string | null;
  maxRefundableAmountCent?: number | null;
}

export async function createMallOrder(input: {
  items: Array<{ skuId: string; quantity: number }>;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  remark?: string;
}) {
  await ensureLogin();
  return request<MallOrder>("/mall/orders", { method: "POST", data: input });
}

export async function getMyMallOrders() {
  await ensureLogin();
  return request<{ items: MallOrder[] }>("/my/mall-orders");
}

export async function getMyMallOrder(id: string) {
  await ensureLogin();
  return request<MallOrder>(`/my/mall-orders/${encodeURIComponent(id)}`);
}

export async function createMallAfterSale(input: { orderId: string; type?: string; reason: string; note?: string; attachments?: string[] }) {
  await ensureLogin();
  return request<MallAfterSale>("/my/mall-aftersales", { method: "POST", data: input });
}

export async function uploadMallAfterSaleAttachment(filePath: string): Promise<string> {
  const token = await ensureLogin();
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${API_BASE_URL}/my/uploads/aftersale`,
      filePath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      success: (response) => {
        try {
          const body = JSON.parse(String(response.data || "{}"));
          if (response.statusCode >= 200 && response.statusCode < 300 && body?.code === "OK" && body?.data?.url) {
            resolve(String(body.data.url));
            return;
          }
          reject(new Error(body?.message || "售后凭证上传失败"));
        } catch {
          reject(new Error("售后凭证上传失败"));
        }
      },
      fail: (error) => reject(new Error(readUniErrMsg(error, "售后凭证上传失败")))
    });
  });
}

export async function prepayMallOrderWechat(id: string) {
  await ensureLogin();
  return request<WechatPrepayResponse>(`/mall/orders/${encodeURIComponent(id)}/payments/wechat/prepay`, { method: "POST" });
}

export async function mockPayMallOrder(id: string) {
  await ensureLogin();
  return request<MallPaymentResult>(`/mall/orders/${encodeURIComponent(id)}/payments/mock-pay`, { method: "POST" });
}

export async function getMallPaymentStatus(id: string) {
  await ensureLogin();
  return request<MallPaymentStatus>(`/mall/orders/${encodeURIComponent(id)}/payment-status`);
}

export async function startMallOrderPayment(id: string): Promise<MallPaymentStatus> {
  await ensureLogin();

  // #ifdef MP-WEIXIN
  const prepay = await prepayMallOrderWechat(id);
  await requestMallMiniProgramPayment(prepay);
  return pollMallPaidStatus(id);
  // #endif

  // #ifndef MP-WEIXIN
  throw new Error("当前平台暂不支持发起商城微信支付，请在微信小程序中支付。");
  // #endif
}

export interface MallOrderItem {
  id: string;
  orderId: string;
  skuId: string;
  productTitle: string;
  skuName: string;
  productType?: "PHYSICAL" | "VIRTUAL" | "SERVICE" | string;
  unitPriceCent: number;
  quantity: number;
  totalAmountCent: number;
  createdAt: string;
}

export interface MallShipment {
  id: string;
  orderId: string;
  company: string | null;
  trackingNo: string | null;
  pickupCode: string | null;
  remark: string | null;
  status: string;
  shippedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MallAfterSale {
  id: string;
  orderId: string;
  type: string;
  status: string;
  reason: string | null;
  note: string | null;
  attachmentsJson?: string[] | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  refunds?: MallRefund[];
  latestRefund?: MallRefund | null;
  refundNotice?: string | null;
}

export interface MallPayment {
  id: string;
  mallOrderId: string;
  provider: "MOCK" | "WECHAT";
  status: "PENDING" | "SUCCESS" | "FAILED" | "CLOSED";
  outTradeNo: string;
  transactionId: string | null;
  amountCent: number;
  notifyRawId: string | null;
  paidAt: string | null;
  failedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MallRefund {
  id: string;
  refundNo: string;
  outRefundNo: string;
  mallOrderId: string;
  afterSaleId: string | null;
  provider: "MOCK" | "WECHAT" | null;
  providerRefundId: string | null;
  amountCent: number;
  status: "REQUESTED" | "APPROVED" | "PROCESSING" | "SUCCESS" | "FAILED" | "REJECTED";
  reason: string | null;
  rejectReason: string | null;
  failedReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MallOrder {
  id: string;
  orderNo: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  fulfillmentType?: "SHIPMENT" | "VIRTUAL" | "MIXED" | string;
  remark: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: MallOrderItem[];
  shipments: MallShipment[];
  afterSales: MallAfterSale[];
  payments?: MallPayment[];
  refunds?: MallRefund[];
  latestPayment?: MallPayment | null;
  latestRefund?: MallRefund | null;
  paymentEnabled?: boolean;
  paymentNotice?: string | null;
}

export interface MallPaymentResult {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  paidAmountCent: number | null;
  paidAt: string | null;
  paymentStatus: "SUCCESS";
}

export interface MallPaymentStatus {
  orderNo: string;
  status: string;
  paidAt: string | null;
  paidAmountCent: number | null;
  paymentProvider: "MOCK" | "WECHAT" | null;
  paymentStatus: "PENDING" | "SUCCESS" | "FAILED" | "CLOSED" | null;
  outTradeNo: string | null;
  transactionId: string | null;
  refundStatus: string | null;
  afterSaleStatus: string | null;
}

function requestMallMiniProgramPayment(input: WechatPrepayResponse): Promise<void> {
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

async function pollMallPaidStatus(id: string): Promise<MallPaymentStatus> {
  let lastStatus: MallPaymentStatus | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await delay(1500);
    lastStatus = await getMallPaymentStatus(id);
    if (["PAID", "SHIPPED", "COMPLETED", "REFUNDING", "REFUNDED"].includes(lastStatus.status)) return lastStatus;
  }
  throw new Error(lastStatus?.status === "PAID" ? "商城订单支付结果同步中，请稍后刷新" : "支付结果确认中，请稍后刷新");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
