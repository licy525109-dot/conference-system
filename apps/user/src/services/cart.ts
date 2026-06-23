import { ensureLogin } from "./auth";
import { request } from "./request";
import type { CreateOrderResponse, RegistrationOrderAttendee } from "./registration";

export interface CartConference {
  id: string;
  title: string;
  startAt: string;
  location: string | null;
  status: string;
}

export interface CartRegistrationSku {
  id: string;
  name: string;
  priceCent: number;
  stock: number;
  soldCount: number;
  status: string;
}

export interface CartRegistrationItem {
  id: string;
  quantity: number;
  couponCode: string | null;
  attendees: unknown[];
  subtotalCent: number;
  conference: CartConference;
  sku: CartRegistrationSku;
  createdAt: string;
  updatedAt: string;
}

export interface CartProductItem {
  id: string;
  quantity: number;
  subtotalCent: number;
  sku: {
    id: string;
    name: string;
    priceCent: number;
    stock: number;
    lockedStock: number;
    soldCount: number;
    availableStock: number;
    status: string;
    product: {
      id: string;
      title: string;
      subtitle: string | null;
      coverImageUrl: string | null;
      productType?: "PHYSICAL" | "VIRTUAL" | "SERVICE" | string;
      status: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface CartData {
  registrationItems: CartRegistrationItem[];
  productItems: CartProductItem[];
}

export interface AddRegistrationCartInput {
  conferenceId: string;
  skuId: string;
  quantity: number;
  couponCode?: string;
  attendees?: Array<Record<string, string | string[]>>;
}

export interface ProductCheckoutResult {
  id: string;
  orderNo: string;
  status: string;
  payableAmountCent: number;
  paymentEnabled: boolean;
  paymentNotice?: string;
}

export async function getCart(): Promise<CartData> {
  await ensureLogin();
  return request<CartData>("/cart", { auth: true });
}

export async function addRegistrationCartItem(input: AddRegistrationCartInput): Promise<{ id: string }> {
  await ensureLogin();
  return request<{ id: string }>("/cart/registration-items", {
    method: "POST",
    auth: true,
    data: input
  });
}

export async function removeRegistrationCartItem(id: string): Promise<{ id: string }> {
  await ensureLogin();
  return request<{ id: string }>(`/cart/registration-items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true
  });
}

export async function addProductCartItem(skuId: string, quantity: number): Promise<{ id: string }> {
  await ensureLogin();
  return request<{ id: string }>("/cart/product-items", {
    method: "POST",
    auth: true,
    data: { skuId, quantity }
  });
}

export async function removeProductCartItem(id: string): Promise<{ id: string }> {
  await ensureLogin();
  return request<{ id: string }>(`/cart/product-items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true
  });
}

export async function checkoutRegistrationCart(itemIds: string[]): Promise<CreateOrderResponse> {
  await ensureLogin();
  return request<CreateOrderResponse>("/cart/checkout/registration", {
    method: "POST",
    auth: true,
    data: { itemIds }
  });
}

export async function checkoutProductCart(input: { itemIds: string[]; couponCode?: string; receiverName?: string; receiverPhone?: string; receiverAddress?: string }): Promise<ProductCheckoutResult> {
  await ensureLogin();
  return request<ProductCheckoutResult>("/cart/checkout/products", {
    method: "POST",
    auth: true,
    data: input
  });
}

export type { RegistrationOrderAttendee };
