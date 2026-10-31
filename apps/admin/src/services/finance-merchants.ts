import { apiRequest, toQuery } from "./api";
import type { ApiList, FinanceRefund, FinanceRefundConfig, ReconciliationResult, WechatBill } from "./types";
export { billImportTarget, refundApprovalText } from "./finance-merchant-policy";

export interface FinanceMerchantOption {
  merchantKey: string;
  companyName: string;
  mchId: string | null;
  enabled: boolean;
}

export type MerchantWechatBill = WechatBill & { merchantKey: string };
export type MerchantReconciliationResult = ReconciliationResult & { merchantKey: string | null };
export type MerchantFinanceRefund = FinanceRefund & {
  managedMerchant?: boolean;
  paymentMerchantRevisionId?: string | null;
  paymentCompanyName?: string | null;
};
export type MerchantRefundConfig = FinanceRefundConfig & {
  registration: FinanceRefundConfig["registration"] & { managedMerchantRefundMode?: "ORIGINAL_ORDER" };
};

export function listFinanceMerchantOptions() {
  return apiRequest<{ items: FinanceMerchantOption[] }>("/admin/finance/merchant-options");
}

export function listMerchantWechatBills(params: { page: number; pageSize: number; status: string; merchantKey: string }) {
  return apiRequest<ApiList<MerchantWechatBill>>(`/admin/finance/wechat-bills${toQuery(params)}`);
}

export function listMerchantReconciliationResults(params: { page: number; pageSize: number; keyword: string; status: string; type: string; merchantKey: string }) {
  return apiRequest<ApiList<MerchantReconciliationResult>>(`/admin/finance/reconciliation-results${toQuery(params)}`);
}
