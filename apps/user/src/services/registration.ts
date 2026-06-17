import type { MyRegistrationItem, RegistrationCredential } from "./registration-types";
import { ensureLogin } from "./auth";
import { request } from "./request";

export interface QuoteRequest {
  conferenceId: string;
  skuId?: string;
  quantity?: number;
  items?: RegistrationOrderItem[];
  couponCode?: string;
}

export interface QuoteResponse extends QuoteRequest {
  skuId: string;
  quantity: number;
  skuName: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  items?: Array<RegistrationOrderItem & {
    skuName: string;
    unitPriceCent: number;
    subtotalCent: number;
  }>;
  discounts?: RegistrationDiscount[];
  messages?: string[];
}

export interface CreateOrderRequest extends QuoteRequest {
  formData?: Record<string, string | string[]>;
  attendees?: RegistrationOrderAttendee[];
}

export interface CreateOrderResponse extends QuoteResponse {
  orderNo: string;
  status: "PENDING";
  expiredAt: string;
}

export interface RegistrationOrderItem {
  skuId: string;
  quantity: number;
}

export interface RegistrationOrderAttendee {
  skuId: string;
  formData: Record<string, string | string[]>;
}

export interface RegistrationDiscount {
  type: "FULL_REDUCTION" | "COUPON";
  title: string;
  amountCent: number;
  couponId?: string;
  promotionRuleId?: string;
}

export function quoteRegistration(input: QuoteRequest): Promise<QuoteResponse> {
  return request<QuoteResponse>("/registration/quote", {
    method: "POST",
    data: withLegacySingleItemFields(input),
    auth: false
  });
}

export async function createRegistrationOrder(input: CreateOrderRequest): Promise<CreateOrderResponse> {
  await ensureLogin();
  return request<CreateOrderResponse>("/registration/orders", {
    method: "POST",
    data: withLegacySingleItemFields(input),
    auth: true
  });
}

export function getMyRegistrations(): Promise<MyRegistrationItem[]> {
  return request<{ items: MyRegistrationItem[] }>("/registrations/my", {
    method: "GET",
    auth: true
  }).then((data) => data.items);
}

export function getRegistrationCredential(registrationId: string): Promise<RegistrationCredential> {
  return request<RegistrationCredential>(`/registrations/${encodeURIComponent(registrationId)}/credential`, {
    method: "GET",
    auth: true
  });
}

export function getOrderRegistrationCredential(orderNo: string): Promise<RegistrationCredential> {
  return request<RegistrationCredential>(`/orders/${encodeURIComponent(orderNo)}/registration-credential`, {
    method: "GET",
    auth: true
  });
}

function withLegacySingleItemFields<TInput extends QuoteRequest>(input: TInput): TInput & { skuId?: string; quantity?: number; formData?: Record<string, string | string[]> } {
  if (!Array.isArray(input.items) || input.items.length !== 1) {
    return input;
  }

  const [item] = input.items;
  const firstAttendee = "attendees" in input && Array.isArray(input.attendees) ? input.attendees[0] : undefined;
  return {
    ...input,
    skuId: input.skuId ?? item.skuId,
    quantity: input.quantity ?? item.quantity,
    ...(!("formData" in input) && firstAttendee?.formData ? { formData: firstAttendee.formData } : {})
  };
}
