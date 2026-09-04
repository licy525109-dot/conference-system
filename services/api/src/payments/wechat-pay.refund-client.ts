import { BadGatewayException, GatewayTimeoutException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPaySigner } from "./wechat-pay.signer";

const REFUND_URL = "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds";
const REFUND_URL_PATH = "/v3/refund/domestic/refunds";
const REFUND_TIMEOUT_MS = 8000;

export interface WechatPayRefundResult {
  refundId: string;
  outRefundNo: string;
  status: string;
}

export interface WechatPayRefundQueryResult extends WechatPayRefundResult {
  amountCent: number;
  totalAmountCent: number;
  successTime: string | null;
}

@Injectable()
export class WechatPayRefundClient {
  constructor(
    private readonly signer: WechatPaySigner,
    private readonly responseVerifier: WechatPayNotifyVerifier = new WechatPayNotifyVerifier()
  ) {}

  async createRefund(input: {
    config: WechatPayConfig;
    outTradeNo: string;
    outRefundNo: string;
    amountCent: number;
    totalAmountCent: number;
    reason: string | null;
  }): Promise<WechatPayRefundResult> {
    const notifyUrl = readRefundNotifyUrl();
    const body = {
      out_trade_no: input.outTradeNo,
      out_refund_no: input.outRefundNo,
      reason: normalizeReason(input.reason),
      notify_url: notifyUrl,
      amount: {
        refund: input.amountCent,
        total: input.totalAmountCent,
        currency: "CNY"
      }
    };
    const serialized = JSON.stringify(body);
    const authorization = this.signer.createAuthorization({
      method: "POST",
      urlPathWithQuery: REFUND_URL_PATH,
      body: serialized,
      config: input.config
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFUND_TIMEOUT_MS);

    try {
      const response = await this.postRefund(serialized, authorization, controller.signal);
      const { payload, rawBody } = await readJsonResponse(response);
      if (!response.ok) {
        throw new WechatRefundHttpError(response.status, payload, response.headers.get("request-id"));
      }
      this.verifyResponse(response, rawBody);
      const refundId = readString(payload.refund_id);
      const outRefundNo = readString(payload.out_refund_no);
      const status = readString(payload.status);
      if (!refundId || !outRefundNo || !status) {
        throw new WechatRefundHttpError(response.status, payload, response.headers.get("request-id"), "微信退款响应缺少必要字段");
      }
      return { refundId, outRefundNo, status };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (isAbortError(error)) {
        throw new GatewayTimeoutException({ code: "WECHAT_PAY_REFUND_FAILED", message: "微信退款请求超时" });
      }
      if (error instanceof WechatRefundHttpError) {
        throw new BadGatewayException({
          code: "WECHAT_PAY_REFUND_FAILED",
          message: "微信退款申请失败",
          detail: error.detail,
          requestId: error.requestId
        });
      }
      throw new BadGatewayException({ code: "WECHAT_PAY_REFUND_FAILED", message: "微信退款申请失败" });
    } finally {
      clearTimeout(timeout);
    }
  }

  async queryRefund(input: { config: WechatPayConfig; outRefundNo: string }): Promise<WechatPayRefundQueryResult> {
    const encodedRefundNo = encodeURIComponent(input.outRefundNo);
    const urlPath = `${REFUND_URL_PATH}/${encodedRefundNo}`;
    const authorization = this.signer.createAuthorization({
      method: "GET",
      urlPathWithQuery: urlPath,
      body: "",
      config: input.config
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFUND_TIMEOUT_MS);

    try {
      const response = await this.getRefund(`${REFUND_URL}/${encodedRefundNo}`, authorization, controller.signal);
      const { payload, rawBody } = await readJsonResponse(response);
      if (!response.ok) {
        throw new WechatRefundHttpError(response.status, payload, response.headers.get("request-id"));
      }
      this.verifyResponse(response, rawBody);
      const refundId = readString(payload.refund_id);
      const outRefundNo = readString(payload.out_refund_no);
      const status = readString(payload.status);
      const amount = isRecord(payload.amount) ? payload.amount : {};
      const amountCent = readNonNegativeInt(amount.refund);
      const totalAmountCent = readNonNegativeInt(amount.total);
      const successTime = readString(payload.success_time);
      if (!refundId || !outRefundNo || !status || amountCent === null || totalAmountCent === null) {
        throw new WechatRefundHttpError(response.status, payload, response.headers.get("request-id"), "微信退款查询响应缺少必要字段");
      }
      return { refundId, outRefundNo, status, amountCent, totalAmountCent, successTime };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (isAbortError(error)) {
        throw new GatewayTimeoutException({ code: "WECHAT_PAY_REFUND_QUERY_FAILED", message: "微信退款查询超时" });
      }
      if (error instanceof WechatRefundHttpError) {
        throw new BadGatewayException({
          code: "WECHAT_PAY_REFUND_QUERY_FAILED",
          message: "微信退款查询失败",
          detail: error.detail,
          requestId: error.requestId
        });
      }
      throw new BadGatewayException({ code: "WECHAT_PAY_REFUND_QUERY_FAILED", message: "微信退款查询失败" });
    } finally {
      clearTimeout(timeout);
    }
  }

  protected postRefund(body: string, authorization: string, signal: AbortSignal): Promise<Response> {
    return fetch(REFUND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization
      },
      body,
      signal
    });
  }

  protected getRefund(url: string, authorization: string, signal: AbortSignal): Promise<Response> {
    return fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization
      },
      signal
    });
  }

  private verifyResponse(response: Response, rawBody: Buffer): void {
    this.responseVerifier.verifySignature({
      headers: {
        timestamp: response.headers.get("wechatpay-timestamp") ?? "",
        nonce: response.headers.get("wechatpay-nonce") ?? "",
        signature: response.headers.get("wechatpay-signature") ?? "",
        serial: response.headers.get("wechatpay-serial") ?? ""
      },
      rawBody
    });
  }
}

function readRefundNotifyUrl(): string {
  const value = process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim();
  if (!value) throw new InternalServerErrorException("WECHAT_PAY_REFUND_NOTIFY_URL is not configured");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search) throw new Error("invalid refund notify URL");
  } catch {
    throw new InternalServerErrorException("WECHAT_PAY_REFUND_NOTIFY_URL must be an HTTPS URL without query parameters");
  }
  return value;
}

function normalizeReason(value: string | null): string {
  const reason = value?.trim() || "嘉宾无法参会";
  return Array.from(reason).slice(0, 80).join("");
}

async function readJsonResponse(response: Response): Promise<{ payload: Record<string, unknown>; rawBody: Buffer }> {
  const rawBody = Buffer.from(await response.arrayBuffer());
  try {
    const value = JSON.parse(rawBody.toString("utf8")) as unknown;
    return { payload: isRecord(value) ? value : {}, rawBody };
  } catch {
    return { payload: {}, rawBody };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonNegativeInt(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

class WechatRefundHttpError extends Error {
  constructor(
    readonly status: number,
    payload: Record<string, unknown>,
    readonly requestId: string | null,
    fallback = "微信退款请求失败"
  ) {
    const code = readString(payload.code);
    const message = readString(payload.message);
    super(message || code || fallback);
    this.name = "WechatRefundHttpError";
  }

  get detail(): string {
    return this.message.slice(0, 300);
  }
}
