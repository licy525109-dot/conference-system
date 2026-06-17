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

export async function askConferenceAi(conferenceId: string, question: string) {
  await ensureLogin();
  return request<{ answer: string; sources: Array<Record<string, unknown>>; provider: string }>(`/conferences/${encodeURIComponent(conferenceId)}/ai/ask`, {
    method: "POST",
    data: { question }
  });
}

export function getConferenceAiSuggestions(conferenceId: string) {
  return request<{ items: string[] }>(`/conferences/${encodeURIComponent(conferenceId)}/ai/suggestions`, { auth: false });
}

export async function createInvoiceApplication(input: { orderNo: string; title: string; taxNo?: string; email?: string }) {
  await ensureLogin();
  return request<Record<string, unknown>>("/invoices", { method: "POST", data: input });
}

export async function getMyInvoices() {
  await ensureLogin();
  return request<{ items: Array<Record<string, unknown>> }>("/my/invoices");
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
  return request<{ items: Array<Record<string, unknown>> }>("/mall/my/orders");
}
