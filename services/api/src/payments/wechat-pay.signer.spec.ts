import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPaySigner } from "./wechat-pay.signer";

describe("WechatPaySigner Authorization", () => {
  it("creates the WeChat Pay API v3 Authorization header from method, URL path, timestamp, nonce, and exact body", () => {
    const signer = new RecordingWechatPaySigner();
    const body = JSON.stringify({
      appid: "wx-real-app",
      mchid: "1900000001",
      amount: {
        total: 1,
        currency: "CNY"
      }
    });

    const authorization = signer.createAuthorization({
      method: "POST",
      urlPathWithQuery: "/v3/pay/transactions/jsapi",
      body,
      config: createConfig()
    });

    assert.equal(
      signer.lastMessage,
      `POST\n/v3/pay/transactions/jsapi\n1700000000\nnonce-for-test\n${body}\n`
    );
    assert.ok(authorization.startsWith("WECHATPAY2-SHA256-RSA2048 "));
    assert.match(authorization, /mchid="1900000001"/);
    assert.match(authorization, /nonce_str="nonce-for-test"/);
    assert.match(authorization, /timestamp="1700000000"/);
    assert.match(authorization, /serial_no="merchant-api-cert-serial"/);
    assert.match(authorization, /signature="signature-for-test"/);
    assert.doesNotMatch(authorization, /^WECHATPAY2-SHA256-RSA2048,/);
  });
});

class RecordingWechatPaySigner extends WechatPaySigner {
  lastMessage = "";

  override createTimestamp(): string {
    return "1700000000";
  }

  override createNonce(): string {
    return "nonce-for-test";
  }

  override sign(message: string): string {
    this.lastMessage = message;
    return "signature-for-test";
  }
}

function createConfig(): WechatPayConfig {
  return {
    appId: "wx-real-app",
    mchId: "1900000001",
    mchSerialNo: "merchant-api-cert-serial",
    apiV3Key: "not-used-by-request-signing",
    privateKeyPem: "not-used-in-test",
    notifyUrl: "https://example.com/api/payments/wechat/notify"
  };
}
