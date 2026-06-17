import { BadRequestException, Injectable } from "@nestjs/common";

interface WecomTokenResponse {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface WecomGroupListResponse {
  errcode?: number;
  errmsg?: string;
  group_chat_list?: Array<{ chat_id?: string; status?: number }>;
}

interface WecomGroupDetailResponse {
  errcode?: number;
  errmsg?: string;
  group_chat?: Record<string, unknown>;
}

@Injectable()
export class WecomClientAdapter {
  async fetchAccessToken(corpId: string, secret: string): Promise<{ accessToken: string; expiresIn: number }> {
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`;
    const data = await requestJson<WecomTokenResponse>(url);
    if (data.errcode !== 0 || !data.access_token) {
      throw new BadRequestException(`企业微信 AccessToken 获取失败：${data.errmsg || data.errcode || "unknown error"}`);
    }
    return { accessToken: data.access_token, expiresIn: Math.max(60, Number(data.expires_in || 7200)) };
  }

  async checkCustomerContactPermission(accessToken: string): Promise<{ ok: boolean; message: string }> {
    const data = await requestJson<WecomGroupListResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/list?access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST", body: JSON.stringify({ status_filter: 0, limit: 1 }) }
    );
    if (data.errcode === 0) return { ok: true, message: "客户联系客户群接口可访问" };
    return { ok: false, message: `客户联系权限检测失败：${data.errmsg || data.errcode || "unknown error"}` };
  }

  async listCustomerGroups(accessToken: string): Promise<Array<Record<string, unknown>>> {
    const list = await requestJson<WecomGroupListResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/list?access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST", body: JSON.stringify({ status_filter: 0, limit: 100 }) }
    );
    if (list.errcode !== 0) {
      throw new BadRequestException(`客户群列表同步失败：${list.errmsg || list.errcode || "unknown error"}`);
    }
    const groups: Array<Record<string, unknown>> = [];
    for (const item of list.group_chat_list ?? []) {
      if (!item.chat_id) continue;
      const detail = await requestJson<WecomGroupDetailResponse>(
        `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/groupchat/get?access_token=${encodeURIComponent(accessToken)}`,
        { method: "POST", body: JSON.stringify({ chat_id: item.chat_id, need_name: 1 }) }
      );
      groups.push(detail.errcode === 0 && detail.group_chat ? detail.group_chat : { chat_id: item.chat_id, status: item.status });
    }
    return groups;
  }
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
  return (await response.json()) as T;
}
