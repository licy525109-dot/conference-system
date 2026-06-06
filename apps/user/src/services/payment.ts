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
  registrationId: string | null;
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
