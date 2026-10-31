import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billImportTarget, refundApprovalText } from "./finance-merchant-policy";
import type { MerchantRefundConfig } from "./finance-merchants";

describe("finance merchant UI policy", () => {
  it("keeps imports bound to the selected bill merchant/date/type", () => {
    const bill = { billDate: "2026-10-30", billType: "TRADE", merchantKey: "merchant-a" };
    const target = billImportTarget(bill);
    assert.deepEqual(target, bill);
    bill.merchantKey = "merchant-b";
    assert.equal(target.merchantKey, "merchant-a");
  });

  it("confirms original-merchant WeChat refunds even when the default configuration is mock", () => {
    const config = { registration: { mockEnabled: true, wechatRefundEnabled: false } } as MerchantRefundConfig;
    const message = refundApprovalText({ sourceType: "REGISTRATION", managedMerchant: true, paymentMerchantRevisionId: "original-revision", paymentCompanyName: "原收款公司" }, config);
    assert.match(message, /原收款公司/);
    assert.match(message, /不使用 mock/);
    assert.doesNotMatch(message, /立即标记退款成功|未开启微信真实退款/);
  });

  it("does not label managed refunds unavailable when default configuration is missing", () => {
    const message = refundApprovalText({ sourceType: "REGISTRATION", paymentMerchantRevisionId: "original-revision" }, null);
    assert.match(message, /原收款单位/);
    assert.doesNotMatch(message, /未开启微信真实退款/);
  });

  it("preserves default mock and unconfigured confirmation behavior", () => {
    const config = { registration: { mockEnabled: true, wechatRefundEnabled: false } } as MerchantRefundConfig;
    assert.match(refundApprovalText({ sourceType: "REGISTRATION" }, config), /立即标记退款成功/);
    assert.match(refundApprovalText({ sourceType: "REGISTRATION" }, null), /不会自动打款/);
  });
});
