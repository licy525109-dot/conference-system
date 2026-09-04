import { BadGatewayException, GatewayTimeoutException, Injectable } from "@nestjs/common";
import { readWechatPayConfig, WechatPayConfig } from "./wechat-pay.config";
import { WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPaySigner } from "./wechat-pay.signer";

const WECHAT_PAY_API_ORIGIN = "https://api.mch.weixin.qq.com";
const WECHAT_PAY_HTTP_TIMEOUT_MS = 5000;

export interface WechatPayTransactionResult {
  outTradeNo: string;
  transactionId: string | null;
  tradeState: string;
  amountTotal: number | null;
  successTime: Date | null;
}

@Injectable()
export class WechatPayTransactionClient {
  constructor(
    private readonly signer: WechatPaySigner,
    private readonly verifier: WechatPayNotifyVerifier
  ) {}

  async queryByOutTradeNo(outTradeNo: string): Promise<WechatPayTransactionResult> {
    const config = readWechatPayConfig();
    const encodedOutTradeNo = encodeURIComponent(outTradeNo);
    const urlPathWithQuery = `/v3/pay/transactions/out-trade-no/${encodedOutTradeNo}?mchid=${encodeURIComponent(config.mchId)}`;
    const response = await this.request({ method: "GET", urlPathWithQuery, body: "", config });

    if (response.status === 404 && readResponseCode(response.payload) === "ORDER_NOT_EXIST") {
      this.verifyResponse(response);
      return {
        outTradeNo,
        transactionId: null,
        tradeState: "NOT_EXIST",
        amountTotal: null,
        successTime: null
      };
    }
    if (!response.ok) {
      throw buildWechatPayGatewayError("查询微信支付订单失败", response);
    }

    this.verifyResponse(response);
    return parseTransactionResult(response.payload, outTradeNo);
  }

  async closeByOutTradeNo(outTradeNo: string): Promise<void> {
    const config = readWechatPayConfig();
    const encodedOutTradeNo = encodeURIComponent(outTradeNo);
    const urlPathWithQuery = `/v3/pay/transactions/out-trade-no/${encodedOutTradeNo}/close`;
    const body = JSON.stringify({ mchid: config.mchId });
    const response = await this.request({ method: "POST", urlPathWithQuery, body, config });
    if (!response.ok) {
      throw buildWechatPayGatewayError("关闭微信支付订单失败", response);
    }
    this.verifyResponse(response);
  }

  private async request(input: {
    method: "GET" | "POST";
    urlPathWithQuery: string;
    body: string;
    config: WechatPayConfig;
  }): Promise<SignedWechatPayResponse> {
    const authorization = this.signer.createAuthorization(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WECHAT_PAY_HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(`${WECHAT_PAY_API_ORIGIN}${input.urlPathWithQuery}`, {
        method: input.method,
        headers: {
          accept: "application/json",
          authorization,
          ...(input.method === "POST" ? { "content-type": "application/json" } : {})
        },
        ...(input.method === "POST" ? { body: input.body } : {}),
        signal: controller.signal
      });
      const rawBody = Buffer.from(await response.arrayBuffer());
      const payload = parseResponsePayload(rawBody);
      return {
        ok: response.ok,
        status: response.status,
        payload,
        rawBody,
        headers: readSignatureHeaders(response.headers)
      };
    } catch (error) {
      if (isAbortError(error)) {
        throw new GatewayTimeoutException("微信支付查单或关单请求超时");
      }
      if (error instanceof BadGatewayException || error instanceof GatewayTimeoutException) throw error;
      throw new BadGatewayException("微信支付查单或关单请求失败");
    } finally {
      clearTimeout(timeout);
    }
  }

  private verifyResponse(response: SignedWechatPayResponse): void {
    this.verifier.verifySignature({
      headers: response.headers,
      rawBody: response.rawBody
    });
  }
}

interface SignedWechatPayResponse {
  ok: boolean;
  status: number;
  payload: unknown;
  rawBody: Buffer;
  headers: WechatPayHeaders;
}

function parseTransactionResult(payload: unknown, expectedOutTradeNo: string): WechatPayTransactionResult {
  if (!isRecord(payload)) throw new BadGatewayException("微信支付查单响应格式无效");
  const outTradeNo = readRequiredString(payload.out_trade_no, "out_trade_no");
  if (outTradeNo !== expectedOutTradeNo) throw new BadGatewayException("微信支付查单响应订单号不匹配");
  const tradeState = readRequiredString(payload.trade_state, "trade_state");
  const amount = isRecord(payload.amount) && Number.isInteger(payload.amount.total)
    ? Number(payload.amount.total)
    : null;
  const successTime = typeof payload.success_time === "string" ? new Date(payload.success_time) : null;
  if (successTime && Number.isNaN(successTime.getTime())) {
    throw new BadGatewayException("微信支付查单响应支付时间无效");
  }
  return {
    outTradeNo,
    transactionId: typeof payload.transaction_id === "string" && payload.transaction_id ? payload.transaction_id : null,
    tradeState,
    amountTotal: amount,
    successTime
  };
}

function readSignatureHeaders(headers: Headers): WechatPayHeaders {
  return {
    timestamp: headers.get("wechatpay-timestamp") ?? "",
    nonce: headers.get("wechatpay-nonce") ?? "",
    signature: headers.get("wechatpay-signature") ?? "",
    serial: headers.get("wechatpay-serial") ?? ""
  };
}

function parseResponsePayload(rawBody: Buffer): unknown {
  if (rawBody.length === 0) return {};
  try {
    return JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    throw new BadGatewayException("微信支付响应不是有效 JSON");
  }
}

function buildWechatPayGatewayError(message: string, response: SignedWechatPayResponse): BadGatewayException {
  return new BadGatewayException({
    code: readResponseCode(response.payload) ?? "WECHAT_PAY_ORDER_REQUEST_FAILED",
    message,
    statusCode: 502,
    providerStatus: response.status
  });
}

function readResponseCode(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.code === "string" ? payload.code : null;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadGatewayException(`微信支付查单响应缺少 ${field}`);
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
