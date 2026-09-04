import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BadGatewayException, InternalServerErrorException } from "@nestjs/common";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPayRefundClient } from "./wechat-pay.refund-client";
import { WechatPaySigner } from "./wechat-pay.signer";

const config: WechatPayConfig = {
  appId: "wx-test",
  mchId: "1900000001",
  mchSerialNo: "merchant-serial",
  apiV3Key: "12345678901234567890123456789012",
  privateKeyPem: "test-key",
  notifyUrl: "https://example.com/api/payments/wechat/notify"
};

afterEach(() => {
  delete process.env.WECHAT_PAY_REFUND_NOTIFY_URL;
});

describe("WechatPayRefundClient", () => {
  it("signs and submits a refund using server amounts in integer cents", async () => {
    process.env.WECHAT_PAY_REFUND_NOTIFY_URL = "https://example.com/api/payments/wechat/refund-notify";
    const signer = new CapturingSigner();
    const client = new TestRefundClient(signer, new Response(JSON.stringify({
      refund_id: "5030000708202609010000000001",
      out_refund_no: "REG_REFUND_ORDER001",
      status: "PROCESSING"
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await client.createRefund({
      config,
      outTradeNo: "WECHAT_ORDER001",
      outRefundNo: "REG_REFUND_ORDER001",
      amountCent: 328000,
      totalAmountCent: 328000,
      reason: "嘉宾临时无法参会"
    });

    assert.equal(result.status, "PROCESSING");
    assert.equal(client.verifier.calls, 1);
    assert.equal(signer.lastInput?.urlPathWithQuery, "/v3/refund/domestic/refunds");
    assert.equal(client.lastAuthorization, "test-authorization");
    const body = JSON.parse(client.lastBody ?? "{}") as Record<string, any>;
    assert.equal(body.out_trade_no, "WECHAT_ORDER001");
    assert.equal(body.out_refund_no, "REG_REFUND_ORDER001");
    assert.equal(body.notify_url, process.env.WECHAT_PAY_REFUND_NOTIFY_URL);
    assert.deepEqual(body.amount, { refund: 328000, total: 328000, currency: "CNY" });
  });

  it("surfaces a sanitized provider failure without exposing response internals", async () => {
    process.env.WECHAT_PAY_REFUND_NOTIFY_URL = "https://example.com/api/payments/wechat/refund-notify";
    const client = new TestRefundClient(new CapturingSigner(), new Response(JSON.stringify({
      code: "PARAM_ERROR",
      message: "退款金额参数错误"
    }), { status: 400, headers: { "content-type": "application/json", "request-id": "request-001" } }));

    await assert.rejects(
      () => client.createRefund({ config, outTradeNo: "ORDER001", outRefundNo: "REFUND001", amountCent: 1, totalAmountCent: 100, reason: null }),
      (error: unknown) => {
        assert.ok(error instanceof BadGatewayException);
        const response = error.getResponse() as Record<string, unknown>;
        assert.equal(response.code, "WECHAT_PAY_REFUND_FAILED");
        assert.equal(response.detail, "退款金额参数错误");
        assert.equal(response.requestId, "request-001");
        assert.equal(JSON.stringify(response).includes(config.apiV3Key), false);
        return true;
      }
    );
  });

  it("queries a refund by merchant refund number and returns verified amount fields", async () => {
    const signer = new CapturingSigner();
    const client = new TestRefundClient(signer, new Response(JSON.stringify({
      refund_id: "5030000708202609010000000003",
      out_refund_no: "REG_REFUND_ORDER001",
      status: "SUCCESS",
      success_time: "2026-09-03T15:00:00+08:00",
      amount: { refund: 328000, total: 328000 }
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await client.queryRefund({ config, outRefundNo: "REG_REFUND_ORDER001" });

    assert.equal(result.status, "SUCCESS");
    assert.equal(result.amountCent, 328000);
    assert.equal(result.totalAmountCent, 328000);
    assert.equal(client.verifier.calls, 1);
    assert.equal(signer.lastInput?.method, "GET");
    assert.equal(signer.lastInput?.body, "");
    assert.equal(signer.lastInput?.urlPathWithQuery, "/v3/refund/domestic/refunds/REG_REFUND_ORDER001");
    assert.match(client.lastQueryUrl ?? "", /\/v3\/refund\/domestic\/refunds\/REG_REFUND_ORDER001$/);
  });

  it("requires a dedicated HTTPS refund callback URL", async () => {
    const client = new TestRefundClient(new CapturingSigner(), new Response("{}", { status: 200 }));

    await assert.rejects(
      () => client.createRefund({ config, outTradeNo: "ORDER001", outRefundNo: "REFUND001", amountCent: 1, totalAmountCent: 100, reason: null }),
      InternalServerErrorException
    );
  });
});

class CapturingSigner extends WechatPaySigner {
  lastInput: Parameters<WechatPaySigner["createAuthorization"]>[0] | null = null;

  override createAuthorization(input: Parameters<WechatPaySigner["createAuthorization"]>[0]): string {
    this.lastInput = input;
    return "test-authorization";
  }
}

class TestRefundClient extends WechatPayRefundClient {
  lastBody: string | null = null;
  lastAuthorization: string | null = null;
  lastQueryUrl: string | null = null;

  constructor(
    signer: WechatPaySigner,
    private readonly response: Response,
    readonly verifier = new AcceptingResponseVerifier()
  ) {
    super(signer, verifier);
  }

  protected override async postRefund(body: string, authorization: string): Promise<Response> {
    this.lastBody = body;
    this.lastAuthorization = authorization;
    return this.response;
  }

  protected override async getRefund(url: string, authorization: string): Promise<Response> {
    this.lastQueryUrl = url;
    this.lastAuthorization = authorization;
    return this.response;
  }
}

class AcceptingResponseVerifier extends WechatPayNotifyVerifier {
  calls = 0;

  override verifySignature(_input: { headers: WechatPayHeaders; rawBody: Buffer }): void {
    this.calls += 1;
  }
}
