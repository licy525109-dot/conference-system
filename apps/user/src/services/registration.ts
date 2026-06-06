import type { MyRegistrationItem } from "./registration-types";
import { request } from "./request";

export interface QuoteRequest {
  conferenceId: string;
  skuId: string;
  quantity: 1;
}

export interface QuoteResponse extends QuoteRequest {
  skuName: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
}

export interface CreateOrderRequest extends QuoteRequest {
  formData: Record<string, string | string[]>;
}

export interface CreateOrderResponse extends QuoteResponse {
  orderNo: string;
  status: "PENDING";
  expiredAt: string;
}

export function quoteRegistration(input: QuoteRequest): Promise<QuoteResponse> {
  return request<QuoteResponse>("/registration/quote", {
    method: "POST",
    data: input,
    auth: false
  });
}

export function createRegistrationOrder(input: CreateOrderRequest): Promise<CreateOrderResponse> {
  const payload: CreateOrderRequest = {
    conferenceId: input.conferenceId,
    skuId: input.skuId,
    quantity: 1,
    formData: input.formData
  };

  return request<CreateOrderResponse>("/registration/orders", {
    method: "POST",
    data: payload,
    auth: true
  });
}

export function getMyRegistrations(): Promise<MyRegistrationItem[]> {
  return request<{ items: MyRegistrationItem[] }>("/registrations/my", {
    method: "GET",
    auth: true
  }).then((data) => data.items);
}
