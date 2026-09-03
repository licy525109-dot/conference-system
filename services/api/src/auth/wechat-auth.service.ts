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
const RETRYABLE_ACCESS_TOKEN_ERRCODES = new Set([40001, 40014, 42001]);

type WechatHttpPayload = {
  ok: boolean;
  payload: Record<string, unknown>;
};

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
    try {
      return await this.exchangePhoneCode(code, accessToken);
    } catch (error) {
      if (!(error instanceof WechatApiResponseError) || !RETRYABLE_ACCESS_TOKEN_ERRCODES.has(error.errcode)) {
        throw normalizePhoneNumberError(error);
      }

      this.cachedAccessToken = undefined;
      const refreshedAccessToken = await this.getAccessToken();
      try {
        return await this.exchangePhoneCode(code, refreshedAccessToken);
      } catch (retryError) {
        throw normalizePhoneNumberError(retryError);
      }
    }
  }

  private async exchangePhoneCode(code: string, accessToken: string): Promise<WechatPhoneNumber> {
    const url = new URL(PHONE_NUMBER_URL);
    url.searchParams.set("access_token", accessToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CODE2SESSION_TIMEOUT_MS);

    try {
      const response = await this.fetchPhoneNumberPayload(url, code, controller.signal);
      if (!response.ok) {
        throw new BadGatewayException("WeChat phone number request failed");
      }
      return parsePhoneNumberPayload(response.payload);
    } catch (error) {
      if (error instanceof HttpException || error instanceof WechatApiResponseError) throw error;
      if (isAbortError(error)) throw new GatewayTimeoutException("WeChat phone number request timed out");
      throw new BadGatewayException("WeChat phone number request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async fetchPhoneNumberPayload(url: URL, code: string, signal: AbortSignal): Promise<WechatHttpPayload> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal
    });
    return { ok: response.ok, payload: await safeJson(response) };
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
      const response = await this.fetchAccessTokenPayload(url, controller.signal);
      const token = response.payload.access_token;
      const error = readWechatApiError(response.payload);
      if (error) {
        throw normalizeAccessTokenError(error);
      }
      if (!response.ok || typeof token !== "string" || !token) {
        throw new BadGatewayException("微信手机号服务暂不可用，请稍后重试");
      }
      const expiresIn = typeof response.payload.expires_in === "number" ? response.payload.expires_in : 7200;
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

  protected async fetchAccessTokenPayload(url: URL, signal: AbortSignal): Promise<WechatHttpPayload> {
    const response = await fetch(url, { signal });
    return { ok: response.ok, payload: await safeJson(response) };
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
  const error = readWechatApiError(payload);
  if (error) throw error;
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

function readWechatApiError(payload: Record<string, unknown>): WechatApiResponseError | null {
  const parsed = Number(payload.errcode);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return new WechatApiResponseError(parsed, typeof payload.errmsg === "string" ? payload.errmsg : "");
}

function normalizeAccessTokenError(error: WechatApiResponseError): HttpException {
  if ([40013, 40001, 40125].includes(error.errcode)) {
    return new BadGatewayException("微信小程序 AppID 或 AppSecret 配置不正确，请管理员核对生产环境配置");
  }
  if ([40164, 89501, 89503, 89506, 89507].includes(error.errcode)) {
    return new BadGatewayException("微信接口尚未放行生产服务器，请管理员在小程序后台确认接口调用权限");
  }
  return new BadGatewayException(`微信手机号服务暂不可用（错误码 ${error.errcode}），请稍后重试`);
}

function normalizePhoneNumberError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (!(error instanceof WechatApiResponseError)) {
    return new BadGatewayException("微信手机号服务暂不可用，请稍后重试");
  }
  if (error.errcode === 40029) {
    return new BadRequestException("本次手机号授权已失效，请重新点击“一键绑定”并允许授权");
  }
  if (error.errcode === 48001) {
    return new BadRequestException("当前小程序尚未开通微信手机号验证能力，请管理员在小程序后台完成认证和能力开通");
  }
  if ([40013, 40125].includes(error.errcode)) {
    return new BadGatewayException("微信小程序 AppID 或 AppSecret 配置不正确，请管理员核对生产环境配置");
  }
  if (error.errcode === -1) {
    return new BadGatewayException("微信手机号服务繁忙，请稍后重试");
  }
  return new BadGatewayException(`微信手机号绑定未完成（错误码 ${error.errcode}），请联系管理员核对小程序能力配置`);
}

class WechatApiResponseError extends Error {
  constructor(readonly errcode: number, readonly errmsg: string) {
    super(`WeChat API error ${errcode}`);
    this.name = "WechatApiResponseError";
  }
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
