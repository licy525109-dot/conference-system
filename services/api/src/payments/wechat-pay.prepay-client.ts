import { BadGatewayException, GatewayTimeoutException, Injectable } from "@nestjs/common";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPaySigner } from "./wechat-pay.signer";

const JSAPI_PREPAY_URL = "https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi";
const JSAPI_PREPAY_URL_PATH = "/v3/pay/transactions/jsapi";
const WECHAT_PAY_HTTP_TIMEOUT_MS = 5000;
const WECHAT_PAY_PREPAY_FAILED_CODE = "WECHAT_PAY_PREPAY_FAILED";

@Injectable()
export class WechatPayPrepayClient {
  constructor(private readonly signer: WechatPaySigner) {}

  async createJsapiPrepay(input: {
    config: WechatPayConfig;
    body: Record<string, unknown>;
  }): Promise<string> {
    const body = JSON.stringify(input.body);
    const authorization = this.signer.createAuthorization({
      method: "POST",
      urlPathWithQuery: JSAPI_PREPAY_URL_PATH,
      body,
      config: input.config
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WECHAT_PAY_HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(JSAPI_PREPAY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization
        },
        body,
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new WechatPayPrepayHttpError(response.status, payload);
      }

      if (!isRecord(payload) || typeof payload.prepay_id !== "string" || payload.prepay_id.length === 0) {
        throw new WechatPayPrepayHttpError(response.status, payload, "WeChat Pay prepay response is invalid");
      }

      return payload.prepay_id;
    } catch (error) {
      logWechatPrepayError(error);
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new GatewayTimeoutException({
          code: WECHAT_PAY_PREPAY_FAILED_CODE,
          message: "WeChat Pay prepay request timed out",
          statusCode: 504,
          detail: readErrorMessage(error) ?? "WeChat Pay prepay request timed out"
        });
      }
      if (error instanceof WechatPayPrepayHttpError) {
        throw new BadGatewayException(buildWechatPrepayErrorResponse(error, "WeChat Pay prepay request failed"));
      }
      throw new BadGatewayException(buildWechatPrepayErrorResponse(error, "WeChat Pay prepay request failed"));
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

function logWechatPrepayError(error: unknown): void {
  const record = isRecord(error) ? error : {};
  const response = isRecord(record.response) ? record.response : {};

  console.error(
    JSON.stringify({
      event: "WECHAT_PAY_PREPAY_ERROR",
      "error.name": readErrorName(error),
      "error.message": readErrorMessage(error),
      "error.code": readUnknownString(record.code),
      "error.status": readUnknownNumber(record.status),
      "error.response.status": readUnknownNumber(response.status),
      "error.response.data": sanitizeWechatPayLogValue(response.data),
      "error.stack": readUnknownString(record.stack)
    })
  );
}

function buildWechatPrepayErrorResponse(error: unknown, fallbackMessage: string) {
  const record = isRecord(error) ? error : {};
  const response = isRecord(record.response) ? record.response : {};
  const responseData = response.data;
  const detail = readWechatPayResponseMessage(responseData) ?? readErrorMessage(error) ?? fallbackMessage;

  return {
    code: WECHAT_PAY_PREPAY_FAILED_CODE,
    message: fallbackMessage,
    statusCode: 502,
    detail: sanitizeWechatPayLogValue(detail)
  };
}

function readWechatPayResponseMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return readUnknownString(value.message) ?? readUnknownString(value.code);
}

function readErrorName(error: unknown): string | undefined {
  return isRecord(error) ? readUnknownString(error.name) : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  return isRecord(error) ? readUnknownString(error.message) : undefined;
}

function readUnknownString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readUnknownNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function sanitizeWechatPayLogValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeWechatPayLogValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        isSensitiveLogKey(key) ? "[REDACTED]" : sanitizeWechatPayLogValue(entryValue)
      ])
    );
  }

  return value;
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("secret") ||
    normalized.includes("api_v3_key") ||
    normalized.includes("apikey") ||
    normalized.includes("privatekey") ||
    normalized.includes("private_key") ||
    normalized === "openid" ||
    normalized === "authorization"
  );
}

class WechatPayPrepayHttpError extends Error {
  readonly code = "WECHAT_PAY_PREPAY_HTTP_ERROR";
  readonly status: number;
  readonly response: {
    status: number;
    data: unknown;
  };

  constructor(status: number, data: unknown, message = "WeChat Pay prepay request failed") {
    super(readWechatPayResponseMessage(data) ?? message);
    this.name = "WechatPayPrepayHttpError";
    this.status = status;
    this.response = {
      status,
      data
    };
  }
}
