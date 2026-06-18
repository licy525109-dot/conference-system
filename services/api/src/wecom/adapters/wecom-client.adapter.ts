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

interface WecomGroupMessageResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: string;
  fail_list?: unknown[];
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

  async createCustomerGroupMessageTask(
    accessToken: string,
    input: { groups: Array<{ chatId: string; ownerUserId?: string | null }>; contentJson: Record<string, unknown> }
  ): Promise<{ ok: boolean; errcode?: number; errmsg?: string; msgId?: string; raw: Record<string, unknown> }> {
    const payload = buildGroupMessagePayload(input.groups, input.contentJson);
    const data = await requestJson<WecomGroupMessageResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/add_msg_template?access_token=${encodeURIComponent(accessToken)}`,
      { method: "POST", body: JSON.stringify(payload) }
    );
    return {
      ok: data.errcode === 0,
      errcode: data.errcode,
      errmsg: data.errmsg,
      msgId: data.msgid,
      raw: data as Record<string, unknown>
    };
  }
}

function buildGroupMessagePayload(groups: Array<{ chatId: string; ownerUserId?: string | null }>, contentJson: Record<string, unknown>) {
  const text = readMessageText(contentJson);
  return {
    chat_type: "group",
    chat_id_list: groups.map((item) => item.chatId),
    sender: groups.find((item) => item.ownerUserId)?.ownerUserId,
    text: { content: text },
    attachments: Array.isArray(contentJson.attachments) ? contentJson.attachments : undefined
  };
}

function readMessageText(contentJson: Record<string, unknown>): string {
  const text = contentJson.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  if (text && typeof text === "object" && !Array.isArray(text)) {
    const content = (text as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }
  const content = contentJson.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  throw new BadRequestException("群发内容缺少 text.content");
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
  return (await response.json()) as T;
}
