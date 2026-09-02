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

export interface WecomSmartSheetRecord {
  record_id: string;
  create_time?: string | number;
  update_time?: string | number;
  values?: Record<string, unknown>;
  creator_name?: string;
  updater_name?: string;
}

interface WecomSmartSheetRecordsResponse {
  errcode?: number;
  errmsg?: string;
  total?: number;
  has_more?: boolean;
  next_cursor?: string;
  records?: WecomSmartSheetRecord[];
  record_ids?: string[];
}

interface WecomSmartSheetFieldsResponse {
  errcode?: number;
  errmsg?: string;
  fields?: Array<Record<string, unknown>>;
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

  async getSmartSheetFields(accessToken: string, docId: string, sheetId: string): Promise<Array<Record<string, unknown>>> {
    const data = await requestJson<WecomSmartSheetFieldsResponse>(
      smartSheetUrl("get_fields", accessToken),
      { method: "POST", body: JSON.stringify({ docid: docId, sheet_id: sheetId }) }
    );
    assertWecomSuccess(data, "读取智能表字段失败");
    return data.fields ?? [];
  }

  async getSmartSheetRecords(accessToken: string, docId: string, sheetId: string): Promise<WecomSmartSheetRecord[]> {
    const records: WecomSmartSheetRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const data = await requestJson<WecomSmartSheetRecordsResponse>(
        smartSheetUrl("get_records", accessToken),
        {
          method: "POST",
          body: JSON.stringify({
            docid: docId,
            sheet_id: sheetId,
            limit: 1000,
            ...(cursor ? { cursor } : {})
          })
        }
      );
      assertWecomSuccess(data, "读取智能表记录失败");
      records.push(...(data.records ?? []).filter((item) => Boolean(item.record_id)));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return records;
  }

  async addSmartSheetRecords(
    accessToken: string,
    docId: string,
    sheetId: string,
    records: Array<{ values: Record<string, unknown> }>
  ): Promise<string[]> {
    if (records.length === 0) return [];
    const data = await requestJson<WecomSmartSheetRecordsResponse>(
      smartSheetUrl("add_records", accessToken),
      {
        method: "POST",
        body: JSON.stringify({
          docid: docId,
          sheet_id: sheetId,
          records
        })
      }
    );
    assertWecomSuccess(data, "写入智能表记录失败");
    if (Array.isArray(data.record_ids)) return data.record_ids;
    return (data.records ?? []).map((item) => item.record_id).filter(Boolean);
  }

  async updateSmartSheetRecords(
    accessToken: string,
    docId: string,
    sheetId: string,
    records: Array<{ record_id: string; values: Record<string, unknown> }>
  ): Promise<void> {
    if (records.length === 0) return;
    const data = await requestJson<WecomSmartSheetRecordsResponse>(
      smartSheetUrl("update_records", accessToken),
      {
        method: "POST",
        body: JSON.stringify({
          docid: docId,
          sheet_id: sheetId,
          key_type: "CELL_VALUE_KEY_TYPE_FIELD_TITLE",
          records
        })
      }
    );
    assertWecomSuccess(data, "更新智能表记录失败");
  }
}

function smartSheetUrl(action: "get_fields" | "get_records" | "add_records" | "update_records", accessToken: string): string {
  return `https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/${action}?access_token=${encodeURIComponent(accessToken)}`;
}

function assertWecomSuccess(data: { errcode?: number; errmsg?: string }, prefix: string): void {
  if (data.errcode === 0) return;
  throw new BadRequestException(`${prefix}：${data.errmsg || data.errcode || "unknown error"}`);
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
