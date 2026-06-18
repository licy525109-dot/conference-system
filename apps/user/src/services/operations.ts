import { ensureLogin } from "./auth";
import { request } from "./request";

export interface CouponClaimResult {
  campaign: { id: string; name: string; claimCode: string };
  claims: Array<Record<string, unknown>>;
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

export async function createInvoiceApplication(input: { orderNo: string; title: string; taxNo?: string; email?: string }) {
  await ensureLogin();
  return request<Record<string, unknown>>("/invoices", { method: "POST", data: input });
}

export async function getMyInvoices() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/invoices");
}

export async function getMyRefunds() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/refunds");
}

export async function createMallOrder(input: {
  items: Array<{ skuId: string; quantity: number }>;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
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

export async function createMallAfterSale(input: { orderId: string; type?: string; reason?: string; note?: string }) {
  await ensureLogin();
  return request<MallAfterSale>("/my/mall-aftersales", { method: "POST", data: input });
}

export interface MallOrderItem {
  id: string;
  orderId: string;
  skuId: string;
  productTitle: string;
  skuName: string;
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
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  refundNotice?: string | null;
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
  remark: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: MallOrderItem[];
  shipments: MallShipment[];
  afterSales: MallAfterSale[];
  paymentEnabled?: boolean;
  paymentNotice?: string;
}
