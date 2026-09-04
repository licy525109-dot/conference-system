import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadGatewayException, UnauthorizedException } from "@nestjs/common";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPayPrepayClient } from "./wechat-pay.prepay-client";
import { WechatPaySigner } from "./wechat-pay.signer";

const config: WechatPayConfig = {
  appId: "wx-test",
  mchId: "1900000001",
  mchSerialNo: "merchant-serial",
  apiV3Key: "12345678901234567890123456789012",
  privateKeyPem: "test-key",
  notifyUrl: "https://example.com/api/payments/wechat/notify"
};

describe("WechatPayPrepayClient response verification", () => {
  it("verifies the signed success response before returning prepay_id", async () => {
    const verifier = new RecordingVerifier();
    const client = new TestPrepayClient(
      new CapturingSigner(),
      verifier,
      new Response(JSON.stringify({ prepay_id: "wx-prepay-1" }), {
        status: 200,
        headers: signedHeaderPlaceholders()
      })
    );

    const result = await client.createJsapiPrepay({ config, body: { out_trade_no: "ORDER001" } });

    assert.equal(result, "wx-prepay-1");
    assert.equal(verifier.calls, 1);
    assert.equal(verifier.lastRawBody?.toString("utf8"), JSON.stringify({ prepay_id: "wx-prepay-1" }));
    assert.equal(client.lastAuthorization, "test-authorization");
  });

  it("rejects a success response whose WeChat signature is invalid", async () => {
    const verifier = new RecordingVerifier(true);
    const client = new TestPrepayClient(
      new CapturingSigner(),
      verifier,
      new Response(JSON.stringify({ prepay_id: "wx-prepay-1" }), {
        status: 200,
        headers: signedHeaderPlaceholders()
      })
    );

    await assert.rejects(
      () => client.createJsapiPrepay({ config, body: { out_trade_no: "ORDER001" } }),
      BadGatewayException
    );
  });
});

class CapturingSigner extends WechatPaySigner {
  override createAuthorization(): string {
    return "test-authorization";
  }
}

class RecordingVerifier extends WechatPayNotifyVerifier {
  calls = 0;
  lastRawBody: Buffer | null = null;

  constructor(private readonly reject = false) {
    super();
  }

  override verifySignature(input: { headers: WechatPayHeaders; rawBody: Buffer }): void {
    this.calls += 1;
    this.lastRawBody = input.rawBody;
    if (this.reject) throw new UnauthorizedException("invalid response signature");
  }
}

class TestPrepayClient extends WechatPayPrepayClient {
  lastAuthorization: string | null = null;

  constructor(
    signer: WechatPaySigner,
    verifier: WechatPayNotifyVerifier,
    private readonly response: Response
  ) {
    super(signer, verifier);
  }

  protected override async postPrepay(_body: string, authorization: string): Promise<Response> {
    this.lastAuthorization = authorization;
    return this.response;
  }
}

function signedHeaderPlaceholders(): Record<string, string> {
  return {
    "wechatpay-timestamp": "1700000000",
    "wechatpay-nonce": "nonce",
    "wechatpay-signature": "signature",
    "wechatpay-serial": "serial"
  };
}
