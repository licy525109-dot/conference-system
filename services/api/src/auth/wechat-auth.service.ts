import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  HttpException
} from "@nestjs/common";

export interface WechatSession {
  openid: string;
  sessionKey: string;
  unionid: string | null;
}

const CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
const CODE2SESSION_TIMEOUT_MS = 5000;

@Injectable()
export class WechatAuthService {
  async code2Session(code: string): Promise<WechatSession> {
    const appId = readRequiredEnv("WECHAT_APP_ID");
    const appSecret = readRequiredEnv("WECHAT_APP_SECRET");
    const url = new URL(CODE2SESSION_URL);
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CODE2SESSION_TIMEOUT_MS);

    try {
      const payload = await this.fetchCode2Session(url, controller.signal);
      return parseCode2SessionPayload(payload);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new GatewayTimeoutException("WeChat code2Session timed out");
      }

      throw new BadGatewayException("WeChat code2Session request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async fetchCode2Session(url: URL, signal: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "GET",
      signal
    });

    if (!response.ok) {
      throw new BadGatewayException("WeChat code2Session HTTP error");
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload)) {
      throw new BadGatewayException("WeChat code2Session returned invalid JSON");
    }

    return payload;
  }
}

function parseCode2SessionPayload(payload: Record<string, unknown>): WechatSession {
  const errcode = payload.errcode;
  if (typeof errcode === "number" && errcode !== 0) {
    throw new BadRequestException(`WeChat code2Session failed with errcode ${errcode}`);
  }

  const openid = payload.openid;
  const sessionKey = payload.session_key;
  if (typeof openid !== "string" || openid.length === 0 || typeof sessionKey !== "string" || sessionKey.length === 0) {
    throw new BadGatewayException("WeChat code2Session response is missing openid or session_key");
  }

  return {
    openid,
    sessionKey,
    unionid: typeof payload.unionid === "string" && payload.unionid.length > 0 ? payload.unionid : null
  };
}

function readRequiredEnv(name: "WECHAT_APP_ID" | "WECHAT_APP_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`${name} is not configured for WECHAT_LOGIN_MODE=real`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}
