import { apiRequest } from "./api";

export interface PaymentMerchantRevision {
  id: string;
  merchantId: string;
  version: number;
  appId: string;
  mchSerialNo: string;
  platformKeyId: string;
  checkedAt: string | null;
  associationConfirmedAt: string | null;
  createdAt: string;
  credentialsConfigured: boolean;
}

export interface PaymentMerchant {
  id: string;
  companyName: string;
  mchId: string;
  remark: string | null;
  enabled: boolean;
  activeRevisionId: string | null;
  conferenceCount?: number;
  revisions: PaymentMerchantRevision[];
}

export interface PaymentMerchantList {
  defaultMerchant: { id: null; companyName: string; mchId: string | null; source: string };
  encryptionConfigured: boolean;
  items: PaymentMerchant[];
}

export interface PaymentMerchantRevisionInput {
  appId: string;
  mchSerialNo: string;
  platformKeyId: string;
  apiV3Key: string;
  privateKeyPem: string;
  platformPublicKeyPem: string;
}

export interface ConferencePaymentSettings {
  id: string;
  paymentMerchantId: string | null;
  companyName: string;
  paymentMerchant: { companyName: string; enabled: boolean; mchId: string } | null;
}

const base = "/admin/payment-merchants";
const merchantPath = (id: string) => `${base}/${encodeURIComponent(id)}`;
const revisionPath = (id: string, revisionId: string) => `${merchantPath(id)}/revisions/${encodeURIComponent(revisionId)}`;
const conferencePath = (id: string) => `${base}/conferences/${encodeURIComponent(id)}`;

export function listPaymentMerchants() {
  return apiRequest<PaymentMerchantList>(base);
}

export function createPaymentMerchant(input: { companyName: string; mchId: string; remark: string }) {
  return apiRequest<Omit<PaymentMerchant, "revisions">>(base, { method: "POST", body: JSON.stringify(input) });
}

export function updatePaymentMerchant(id: string, input: { remark?: string; enabled?: false }) {
  return apiRequest<Omit<PaymentMerchant, "revisions">>(merchantPath(id), { method: "PATCH", body: JSON.stringify(input) });
}

export function savePaymentMerchantRevision(id: string, input: PaymentMerchantRevisionInput) {
  return apiRequest<PaymentMerchantRevision>(`${merchantPath(id)}/revisions`, { method: "POST", body: JSON.stringify(input) });
}

export function checkPaymentMerchantRevision(id: string, revisionId: string) {
  return apiRequest<PaymentMerchantRevision & { message: string }>(`${revisionPath(id, revisionId)}/check`, { method: "POST" });
}

export function activatePaymentMerchantRevision(id: string, revisionId: string, input: { associationConfirmed: true }) {
  return apiRequest<{ id: string; enabled: boolean; activeRevisionId: string }>(`${revisionPath(id, revisionId)}/activate`, {
    method: "POST", body: JSON.stringify(input)
  });
}

export function getConferencePaymentSettings(id: string) {
  return apiRequest<ConferencePaymentSettings>(conferencePath(id));
}

export function setConferencePaymentSettings(id: string, paymentMerchantId: string | null) {
  return apiRequest<ConferencePaymentSettings>(conferencePath(id), {
    method: "PATCH", body: JSON.stringify({ paymentMerchantId })
  });
}

export function isSelectablePaymentMerchant(merchant: PaymentMerchant): boolean {
  const revision = merchant.revisions.find(item => item.id === merchant.activeRevisionId);
  return Boolean(merchant.enabled && revision?.merchantId === merchant.id && revision.credentialsConfigured
    && revision.checkedAt && revision.associationConfirmedAt);
}
