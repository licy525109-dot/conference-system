import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isMallMockPaymentEnabled, isMallMockRefundEnabled } from "./mall-payment.config";

const originalNodeEnv = process.env.NODE_ENV;
const originalRefundMode = process.env.MALL_REFUND_MODE;

afterEach(() => {
  restore("NODE_ENV", originalNodeEnv);
  restore("MALL_REFUND_MODE", originalRefundMode);
});

describe("mall production payment safety", () => {
  it("never enables database-configured mock payment in production", () => {
    process.env.NODE_ENV = "production";
    assert.equal(isMallMockPaymentEnabled({ mode: "mock", allowMockPayment: true }), false);
  });

  it("never enables mock refunds in production", () => {
    process.env.NODE_ENV = "production";
    process.env.MALL_REFUND_MODE = "mock";
    assert.equal(isMallMockRefundEnabled(), false);
  });
});

function restore(key: string, value: string | undefined): void {
  if (typeof value === "undefined") delete process.env[key];
  else process.env[key] = value;
}
