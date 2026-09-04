import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { WechatPaySigner } from "./wechat-pay.signer";
import { WechatPayTransactionClient } from "./wechat-pay.transaction-client";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe("WechatPayTransactionClient", () => {
  beforeEach(() => {
    process.env.WECHAT_PAY_APP_ID = "wx-app";
    process.env.WECHAT_PAY_MCH_ID = "1900000001";
    process.env.WECHAT_PAY_MCH_SERIAL_NO = "merchant-serial";
    process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
    process.env.WECHAT_PAY_PRIVATE_KEY_PATH = __filename;
    process.env.WECHAT_PAY_NOTIFY_URL = "https://api.example.com/api/payments/wechat/notify";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("queries an order with a signed request and verifies the signed response", async () => {
    const signer = new RecordingSigner();
    const verifier = new RecordingVerifier();
    globalThis.fetch = async (url, init) => {
      assert.equal(
        String(url),
        "https://api.mch.weixin.qq.com/v3/pay/transactions/out-trade-no/ORDER_1?mchid=1900000001"
      );
      assert.equal(init?.method, "GET");
      return signedResponse({
        out_trade_no: "ORDER_1",
        transaction_id: "wx-transaction-1",
        trade_state: "SUCCESS",
        success_time: "2026-09-04T12:00:00+08:00",
        amount: { total: 8800 }
      });
    };

    const result = await new WechatPayTransactionClient(signer, verifier as never).queryByOutTradeNo("ORDER_1");

    assert.equal(result.tradeState, "SUCCESS");
    assert.equal(result.amountTotal, 8800);
    assert.equal(result.transactionId, "wx-transaction-1");
    assert.equal(verifier.verifyCount, 1);
    assert.match(signer.lastPath, /out-trade-no\/ORDER_1\?mchid=1900000001$/);
  });

  it("accepts ORDER_NOT_EXIST only after response signature verification", async () => {
    const verifier = new RecordingVerifier();
    globalThis.fetch = async () => signedResponse({ code: "ORDER_NOT_EXIST" }, 404);

    const result = await new WechatPayTransactionClient(new RecordingSigner(), verifier as never)
      .queryByOutTradeNo("ORDER_MISSING");

    assert.equal(result.tradeState, "NOT_EXIST");
    assert.equal(verifier.verifyCount, 1);
  });

  it("closes the provider order before local inventory can be released", async () => {
    const signer = new RecordingSigner();
    const verifier = new RecordingVerifier();
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, JSON.stringify({ mchid: "1900000001" }));
      return signedResponse(null, 204);
    };

    await new WechatPayTransactionClient(signer, verifier as never).closeByOutTradeNo("ORDER_2");

    assert.match(signer.lastPath, /out-trade-no\/ORDER_2\/close$/);
    assert.equal(verifier.verifyCount, 1);
  });
});

class RecordingSigner extends WechatPaySigner {
  lastPath = "";

  override createAuthorization(input: Parameters<WechatPaySigner["createAuthorization"]>[0]): string {
    this.lastPath = input.urlPathWithQuery;
    return "signed-authorization";
  }
}

class RecordingVerifier {
  verifyCount = 0;

  verifySignature(): void {
    this.verifyCount += 1;
  }
}

function signedResponse(payload: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "wechatpay-timestamp": "1788480000",
      "wechatpay-nonce": "response-nonce",
      "wechatpay-signature": "response-signature",
      "wechatpay-serial": "platform-key-id"
    }
  });
}
