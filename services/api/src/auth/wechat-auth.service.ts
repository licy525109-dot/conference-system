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

export interface WechatPhoneNumber {
  phoneNumber: string;
  purePhoneNumber: string;
  countryCode: string;
}

const CODE2SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
const ACCESS_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const PHONE_NUMBER_URL = "https://api.weixin.qq.com/wxa/business/getuserphonenumber";
const CODE2SESSION_TIMEOUT_MS = 5000;

@Injectable()
export class WechatAuthService {
  private cachedAccessToken?: { value: string; expiresAt: number };

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

  async getPhoneNumber(code: string): Promise<WechatPhoneNumber> {
    const accessToken = await this.getAccessToken();
    const url = new URL(PHONE_NUMBER_URL);
    url.searchParams.set("access_token", accessToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CODE2SESSION_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
        signal: controller.signal
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new BadGatewayException("WeChat phone number request failed");
      }
      return parsePhoneNumberPayload(payload);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isAbortError(error)) throw new GatewayTimeoutException("WeChat phone number request timed out");
      throw new BadGatewayException("WeChat phone number request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 60_000) {
      return this.cachedAccessToken.value;
    }

    const appId = readRequiredEnv("WECHAT_APP_ID");
    const appSecret = readRequiredEnv("WECHAT_APP_SECRET");
    const url = new URL(ACCESS_TOKEN_URL);
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CODE2SESSION_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const payload = await safeJson(response);
      const token = payload.access_token;
      const errcode = payload.errcode;
      if (!response.ok || (typeof errcode === "number" && errcode !== 0) || typeof token !== "string" || !token) {
        throw new BadGatewayException("WeChat access token request failed");
      }
      const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 7200;
      this.cachedAccessToken = {
        value: token,
        expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000
      };
      return token;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isAbortError(error)) throw new GatewayTimeoutException("WeChat access token request timed out");
      throw new BadGatewayException("WeChat access token request failed");
    } finally {
      clearTimeout(timeout);
    }
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

function parsePhoneNumberPayload(payload: Record<string, unknown>): WechatPhoneNumber {
  const errcode = payload.errcode;
  if (typeof errcode === "number" && errcode !== 0) {
    throw new BadRequestException(`WeChat phone number failed with errcode ${errcode}`);
  }
  const phoneInfo = payload.phone_info;
  if (!isRecord(phoneInfo)) {
    throw new BadGatewayException("WeChat phone number response is missing phone_info");
  }
  const phoneNumber = phoneInfo.phoneNumber;
  const purePhoneNumber = phoneInfo.purePhoneNumber;
  const countryCode = phoneInfo.countryCode;
  if (typeof phoneNumber !== "string" || typeof purePhoneNumber !== "string" || typeof countryCode !== "string") {
    throw new BadGatewayException("WeChat phone number response is invalid");
  }
  return { phoneNumber, purePhoneNumber, countryCode };
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return isRecord(payload) ? payload : {};
  } catch {
    return {};
  }
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
