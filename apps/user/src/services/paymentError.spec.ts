import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentErrorMessage } from "./paymentError";

const expiredLoginMessage = "登录已过期";

describe("buildPaymentErrorMessage", () => {
  it("explains AppID and merchant binding failures", () => {
    const error = createApiError("APPID_MCHID_NOT_MATCH");
    assert.match(buildPaymentErrorMessage(error, expiredLoginMessage), /AppID.*商户号绑定/);
  });

  it("explains merchant signing failures without exposing raw details", () => {
    const error = createApiError("SIGN_ERROR: private key mismatch");
    const message = buildPaymentErrorMessage(error, expiredLoginMessage);
    assert.match(message, /证书序列号和私钥/);
    assert.doesNotMatch(message, /private key mismatch/);
  });

  it("keeps unknown provider failures actionable", () => {
    const error = createApiError("UNKNOWN_PROVIDER_ERROR");
    assert.match(buildPaymentErrorMessage(error, expiredLoginMessage), /核对商户平台配置/);
  });

  it("does not misreport disabled real payment as an expired login", () => {
    const error = {
      name: "ApiRequestError",
      statusCode: 403,
      responseMessage: "Real WeChat Pay is disabled"
    };
    assert.match(buildPaymentErrorMessage(error, expiredLoginMessage), /尚未启用真实微信支付/);
  });
});

function createApiError(detail: string) {
  return {
    name: "ApiRequestError",
    statusCode: 502,
    responseCode: "WECHAT_PAY_PREPAY_FAILED",
    responseMessage: "WeChat Pay prepay request failed",
    responseDetail: detail
  };
}
