import type { MerchantFinanceRefund, MerchantRefundConfig, MerchantWechatBill } from "./finance-merchants";

export function billImportTarget(bill: Pick<MerchantWechatBill, "billDate" | "billType" | "merchantKey">) {
  return { billDate: bill.billDate, billType: bill.billType, merchantKey: bill.merchantKey };
}

export function refundApprovalText(row: Pick<MerchantFinanceRefund, "sourceType" | "managedMerchant" | "paymentMerchantRevisionId" | "paymentCompanyName">, config: MerchantRefundConfig | null) {
  if (row.sourceType === "REGISTRATION" && (row.managedMerchant || row.paymentMerchantRevisionId)) {
    return `确认向订单原收款单位${row.paymentCompanyName ? `「${row.paymentCompanyName}」` : ""}提交微信退款？使用原支付配置，不使用 mock；到账以微信回调或查询结果为准。`;
  }
  const runtime = row.sourceType === "MALL" ? config?.mall : config?.registration;
  if (runtime?.mockEnabled) return "当前默认收款配置启用 mock 退款，审核通过后会立即标记退款成功，仅用于测试环境。";
  if (runtime?.wechatRefundEnabled) return "确认审核通过并进入微信退款处理？系统会等待微信退款回调或查询结果，成功前不会改为已到账。";
  return "当前默认收款配置未开启微信真实退款。审核通过后只会进入处理中/待线下处理，不会自动打款，也不会显示退款成功。";
}
