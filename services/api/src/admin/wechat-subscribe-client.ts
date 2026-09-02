import { BadGatewayException, Injectable } from "@nestjs/common";

interface WechatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WechatSubscribeSendResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: string | number;
}

@Injectable()
export class WechatSubscribeClient {
  private cachedToken?: { value: string; expiresAt: number };

  isConfigured(): boolean {
    return Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
  }

  async send(input: {
    openid: string;
    templateId: string;
    page?: string | null;
    data: Record<string, { value: string }>;
  }): Promise<{ ok: boolean; errcode: number; errmsg: string; messageId?: string }> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          touser: input.openid,
          template_id: input.templateId,
          ...(input.page ? { page: input.page } : {}),
          data: input.data,
          miniprogram_state: readMiniProgramState(),
          lang: "zh_CN"
        })
      }
    );
    const data = await safeJson<WechatSubscribeSendResponse>(response);
    return {
      ok: response.ok && Number(data.errcode ?? 0) === 0,
      errcode: Number(data.errcode ?? (response.ok ? 0 : response.status)),
      errmsg: data.errmsg || (response.ok ? "ok" : `HTTP ${response.status}`),
      messageId: typeof data.msgid === "string" || typeof data.msgid === "number" ? String(data.msgid) : undefined
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.value;
    const appId = process.env.WECHAT_APP_ID?.trim();
    const appSecret = process.env.WECHAT_APP_SECRET?.trim();
    if (!appId || !appSecret) throw new BadGatewayException("微信小程序 AppID 或 AppSecret 未配置");
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`
    );
    const data = await safeJson<WechatAccessTokenResponse>(response);
    if (!response.ok || data.errcode || !data.access_token) {
      throw new BadGatewayException(`微信 AccessToken 获取失败：${data.errmsg || data.errcode || response.status}`);
    }
    this.cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 120) * 1000
    };
    return data.access_token;
  }
}

function readMiniProgramState(): "developer" | "trial" | "formal" {
  const value = process.env.WECHAT_MINIPROGRAM_STATE;
  return value === "developer" || value === "trial" ? value : "formal";
}

async function safeJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}
