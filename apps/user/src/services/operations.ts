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
  return request<Record<string, unknown>>("/mall/orders", { method: "POST", data: input });
}

export async function getMyMallOrders() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/mall-orders");
}
