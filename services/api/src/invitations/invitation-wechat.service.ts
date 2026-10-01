import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { invitationUrl } from "./invitation-policy";

export function invitationSigningUrl(input: string, token: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BadRequestException("分享地址无效");
  }
  const canonical = new URL(invitationUrl(token));
  if (
    url.origin !== canonical.origin ||
    url.pathname !== canonical.pathname ||
    url.username ||
    url.password
  )
    throw new BadRequestException("只允许为当前品牌邀请页面签名");
  url.hash = "";
  return url.href;
}
export function signInvitationTicket(
  ticket: string,
  nonceStr: string,
  timestamp: number,
  url: string,
): string {
  return createHash("sha1")
    .update(
      `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`,
    )
    .digest("hex");
}
@Injectable()
export class InvitationWechatService {
  private ticket?: { value: string; expires: number };
  private pendingTicket?: Promise<string>;
  private miniToken?: { value: string; expires: number };
  private readonly codes = new Map<
    string,
    { bytes: Buffer; expires: number }
  >();
  async config(token: string, inputUrl: string) {
    const url = invitationSigningUrl(inputUrl, token);
    const appId = process.env.WECHAT_OFFICIAL_APP_ID?.trim();
    const secret = process.env.WECHAT_OFFICIAL_APP_SECRET?.trim();
    if (!appId || !secret)
      return {
        available: false as const,
        message: "微信分享配置尚未完成，请联系会务",
      };
    const ticket = await this.getTicket(appId, secret);
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = randomBytes(16).toString("hex");
    return {
      available: true as const,
      appId,
      timestamp,
      nonceStr,
      signature: signInvitationTicket(ticket, nonceStr, timestamp, url),
    };
  }
  async registrationCode(path: string): Promise<Buffer> {
    const cached = this.codes.get(path);
    if (cached && cached.expires > Date.now()) return cached.bytes;
    const appId = process.env.WECHAT_APP_ID?.trim();
    const secret = process.env.WECHAT_APP_SECRET?.trim();
    if (!appId || !secret)
      throw new ServiceUnavailableException("小程序入口尚未配置，请联系会务");
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.miniToken || this.miniToken.expires <= Date.now())
        this.miniToken = await this.accessToken(appId, secret);
      try {
        const response = await fetch(
          `https://api.weixin.qq.com/wxa/getwxacode?access_token=${encodeURIComponent(this.miniToken.value)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, width: 430, env_version: "release" }),
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok) throw new Error("upstream");
        const bytes = Buffer.from(await response.arrayBuffer());
        const validImage =
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (bytes[0] === 255 && bytes[1] === 216);
        if (!validImage) {
          const payload = JSON.parse(bytes.toString()) as { errcode?: number };
          if (
            attempt === 0 &&
            [40001, 40014, 42001].includes(Number(payload.errcode))
          ) {
            this.miniToken = undefined;
            continue;
          }
          throw new Error("upstream");
        }
        if (bytes.length > 2_000_000) throw new Error("size");
        if (this.codes.size >= 200)
          this.codes.delete(this.codes.keys().next().value!);
        this.codes.set(path, { bytes, expires: Date.now() + 3600000 });
        return bytes;
      } catch {
        throw new BadGatewayException(
          "暂时无法获取小程序码，请稍后重试或联系会务",
        );
      }
    }
    throw new BadGatewayException("小程序码暂不可用");
  }
  private async accessToken(
    appId: string,
    secret: string,
  ): Promise<{ value: string; expires: number }> {
    const query = new URLSearchParams({
      grant_type: "client_credential",
      appid: appId,
      secret,
    });
    const payload = await this.fetchJson(
      `https://api.weixin.qq.com/cgi-bin/token?${query}`,
    );
    if (typeof payload.access_token !== "string")
      throw new BadGatewayException("微信接口配置不可用，请联系管理员核验");
    return {
      value: payload.access_token,
      expires:
        Date.now() +
        Math.max(60, Number(payload.expires_in || 7200) - 300) * 1000,
    };
  }
  private async getTicket(appId: string, secret: string): Promise<string> {
    if (this.ticket && this.ticket.expires > Date.now())
      return this.ticket.value;
    if (this.pendingTicket) return this.pendingTicket;
    this.pendingTicket = (async () => {
      const token = await this.accessToken(appId, secret);
      const payload = await this.fetchJson(
        `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(token.value)}&type=jsapi`,
      );
      if (payload.errcode !== 0 || typeof payload.ticket !== "string")
        throw new BadGatewayException("微信分享暂不可用，请联系管理员核验");
      this.ticket = {
        value: payload.ticket,
        expires:
          Date.now() +
          Math.max(60, Number(payload.expires_in || 7200) - 300) * 1000,
      };
      return this.ticket.value;
    })();
    try {
      return await this.pendingTicket;
    } finally {
      this.pendingTicket = undefined;
    }
  }
  protected async fetchJson(url: string): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("upstream");
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new BadGatewayException("微信服务暂不可用，请稍后重试");
    }
  }
}
