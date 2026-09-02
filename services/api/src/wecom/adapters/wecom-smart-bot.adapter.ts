import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { WecomSmartSheetRecord, WecomSmartSheetSheet } from "./wecom-client.adapter";

export interface WecomSmartBotCredentials {
  botId: string;
  secret: string;
}

interface SmartBotAuthResponse {
  errcode?: number;
  errmsg?: string;
  token?: string;
}

interface SmartBotGatewayResponse {
  errcode?: number;
  errmsg?: string;
  results_json?: string;
}

interface SmartBotInnerResponse {
  result?: string | Record<string, unknown>;
  error?: { code?: number | string; message?: string; data?: string } | null;
}

interface SmartBotSheetResponse {
  errcode?: number;
  errmsg?: string;
  sheets?: Array<Record<string, unknown>>;
}

interface SmartBotFieldsResponse {
  errcode?: number;
  errmsg?: string;
  fields?: Array<Record<string, unknown>>;
}

interface SmartBotRecordsResponse {
  errcode?: number;
  errmsg?: string;
  total?: number;
  has_more?: boolean;
  next_cursor?: string;
  records?: Array<Record<string, unknown>>;
  record_ids?: string[];
}

const SMART_BOT_AUTH_URL = "https://qyapi.weixin.qq.com/cgi-bin/aibot/cli/get_cli_config";
const SMART_BOT_API_BASE_URL = "https://qyapi.weixin.qq.com/cli";
const TOKEN_EXPIRED_ERRCODE = 853004;

@Injectable()
export class WecomSmartBotAdapter {
  private readonly tokenCache = new Map<string, string>();

  async verifyCredentials(credentials: WecomSmartBotCredentials): Promise<void> {
    await this.fetchToken(credentials, true);
  }

  async getSmartSheetSheets(
    credentials: WecomSmartBotCredentials,
    docUrl: string
  ): Promise<WecomSmartSheetSheet[]> {
    const data = await this.invoke<SmartBotSheetResponse>(
      credentials,
      "/smartsheet/get",
      { docid: docUrl },
      "读取智能表子表失败"
    );
    return (data.sheets ?? []).map((item) => {
      const type = firstString(item, ["type", "sheet_type"]);
      const fieldCount = firstNumber(item, ["field_count"]);
      const recordCount = firstNumber(item, ["record_count"]);
      return {
        sheet_id: firstString(item, ["sheet_id", "id"]),
        title: firstString(item, ["title", "sheet_title", "sheet_name", "name"]),
        ...(type ? { type } : {}),
        ...(typeof fieldCount === "number" ? { field_count: fieldCount } : {}),
        ...(typeof recordCount === "number" ? { record_count: recordCount } : {})
      };
    }).filter((item) => Boolean(item.sheet_id && item.title));
  }

  async getSmartSheetFields(
    credentials: WecomSmartBotCredentials,
    docUrl: string,
    sheetId: string
  ): Promise<Array<Record<string, unknown>>> {
    const data = await this.invoke<SmartBotFieldsResponse>(
      credentials,
      "/smartsheet/fields/list",
      { docid: docUrl, sheet_id: sheetId, type: "fields" },
      "读取智能表字段失败"
    );
    return data.fields ?? [];
  }

  async getSmartSheetRecords(
    credentials: WecomSmartBotCredentials,
    docUrl: string,
    sheetId: string
  ): Promise<WecomSmartSheetRecord[]> {
    const records: WecomSmartSheetRecord[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const data = await this.invoke<SmartBotRecordsResponse>(
        credentials,
        "/smartsheet/records/list",
        {
          docid: docUrl,
          sheet_id: sheetId,
          type: "records",
          key_type: "field_title",
          limit: 1000,
          ...(cursor ? { cursor } : {})
        },
        "读取智能表记录失败"
      );
      records.push(...(data.records ?? []).map(normalizeSmartBotRecord).filter((item) => Boolean(item.record_id)));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return records;
  }

  async addSmartSheetRecords(
    credentials: WecomSmartBotCredentials,
    docUrl: string,
    sheetId: string,
    records: Array<{ values: Record<string, unknown> }>
  ): Promise<string[]> {
    if (records.length === 0) return [];
    const data = await this.invoke<SmartBotRecordsResponse>(
      credentials,
      "/smartsheet/records/add",
      {
        docid: docUrl,
        sheet_id: sheetId,
        type: "add",
        key_type: "field_title",
        records: records.map((record) => ({ values: encodeSmartBotValues(record.values) }))
      },
      "写入智能表记录失败"
    );
    if (Array.isArray(data.record_ids)) return data.record_ids.filter(Boolean);
    return (data.records ?? []).map((item) => firstString(item, ["record_id", "id"])).filter(Boolean);
  }

  async updateSmartSheetRecords(
    credentials: WecomSmartBotCredentials,
    docUrl: string,
    sheetId: string,
    records: Array<{ record_id: string; values: Record<string, unknown> }>
  ): Promise<void> {
    if (records.length === 0) return;
    await this.invoke<SmartBotRecordsResponse>(
      credentials,
      "/smartsheet/records/update",
      {
        docid: docUrl,
        sheet_id: sheetId,
        type: "update",
        key_type: "field_title",
        records: records.map((record) => ({
          record_id: record.record_id,
          values: encodeSmartBotValues(record.values)
        }))
      },
      "更新智能表记录失败"
    );
  }

  private async invoke<T extends { errcode?: number; errmsg?: string }>(
    credentials: WecomSmartBotCredentials,
    path: string,
    payload: Record<string, unknown>,
    prefix: string,
    retryAfterRefresh = true
  ): Promise<T> {
    const token = await this.fetchToken(credentials);
    const data = await requestJson<SmartBotGatewayResponse>(
      `${SMART_BOT_API_BASE_URL}${path}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ payload: JSON.stringify(payload) })
      }
    );
    if (data.errcode === TOKEN_EXPIRED_ERRCODE && retryAfterRefresh) {
      this.tokenCache.delete(credentialsKey(credentials));
      await this.fetchToken(credentials, true);
      return this.invoke(credentials, path, payload, prefix, false);
    }
    assertSmartBotSuccess(data, prefix);
    const result = decodeGatewayResult(data, prefix) as T;
    assertSmartBotSuccess(result, prefix);
    return result;
  }

  private async fetchToken(credentials: WecomSmartBotCredentials, force = false): Promise<string> {
    const botId = credentials.botId.trim();
    const secret = credentials.secret.trim();
    if (!botId || !secret) throw new BadRequestException("请填写智能机器人 Bot ID 和 Secret");
    const key = credentialsKey({ botId, secret });
    const cached = force ? undefined : this.tokenCache.get(key);
    if (cached) return cached;

    const time = Math.floor(Date.now() / 1000);
    const nonce = `cli_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const signature = createHash("sha256")
      .update(`${secret}${botId}${time}${nonce}`)
      .digest("hex");
    const data = await requestJson<SmartBotAuthResponse>(SMART_BOT_AUTH_URL, {
      method: "POST",
      body: JSON.stringify({ bot_id: botId, time, nonce, signature, bind_source: 1 })
    });
    assertSmartBotSuccess(data, "智能机器人授权失败");
    if (!data.token) throw new BadRequestException("智能机器人授权失败：企业微信未返回访问令牌");
    this.tokenCache.set(key, data.token);
    return data.token;
  }
}

function decodeGatewayResult(data: SmartBotGatewayResponse, prefix: string): Record<string, unknown> {
  if (!data.results_json) throw new BadRequestException(`${prefix}：企业微信返回数据缺少 results_json`);
  let inner: SmartBotInnerResponse;
  try {
    inner = JSON.parse(data.results_json) as SmartBotInnerResponse;
  } catch {
    throw new BadRequestException(`${prefix}：企业微信返回了无法识别的网关数据`);
  }
  const innerCode = Number(inner.error?.code || 0);
  if (Number.isFinite(innerCode) && innerCode !== 0) {
    throwSmartBotError(prefix, innerCode, inner.error?.message || inner.error?.data);
  }
  if (typeof inner.result === "string") {
    try {
      const result = JSON.parse(inner.result) as unknown;
      if (isRecord(result)) return result;
    } catch {
      // A non-JSON result is never valid for the SmartSheet methods used here.
    }
  }
  if (isRecord(inner.result)) return inner.result;
  throw new BadRequestException(`${prefix}：企业微信返回数据缺少 result`);
}

function assertSmartBotSuccess(data: { errcode?: number; errmsg?: string }, prefix: string): void {
  const code = Number(data.errcode || 0);
  if (code === 0) return;
  throwSmartBotError(prefix, code, data.errmsg);
}

function throwSmartBotError(prefix: string, code: number, message?: string): never {
  const detail = message || String(code || "unknown error");
  if (code === 851003 || detail.toLowerCase().includes("no authority")) {
    throw new BadRequestException(
      `${prefix}：智能机器人尚未获得该文档权限（851003 no authority）。请用已授权文档能力的账号创建机器人，并确认该账号可编辑目标智能表`
    );
  }
  if ([853000, 853001, 853002, 853003, 853005].includes(code)) {
    throw new BadRequestException(`${prefix}：Bot ID、Secret 或机器人授权状态无效（${code}）`);
  }
  throw new BadRequestException(`${prefix}：${detail}`);
}

function credentialsKey(credentials: WecomSmartBotCredentials): string {
  return createHash("sha256").update(`${credentials.botId}\u0000${credentials.secret}`).digest("hex");
}

function encodeSmartBotValues(values: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, JSON.stringify(value)]));
}

function normalizeSmartBotRecord(value: Record<string, unknown>): WecomSmartSheetRecord {
  const rawValues = isRecord(value.values) ? value.values : {};
  return {
    record_id: firstString(value, ["record_id", "id"]),
    create_time: readStringOrNumber(value.create_time),
    update_time: readStringOrNumber(value.update_time),
    values: Object.fromEntries(Object.entries(rawValues).map(([field, cell]) => [field, decodeSmartBotCell(cell)])),
    creator_name: firstString(value, ["creator_name"]),
    updater_name: firstString(value, ["updater_name"])
  };
}

function decodeSmartBotCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function firstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number") return String(candidate);
  }
  return "";
}

function firstNumber(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function readStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", ...(init.headers ?? {}) }
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new BadRequestException("企业微信智能机器人接口请求超时，请稍后重试");
    }
    throw new BadRequestException(`企业微信智能机器人接口连接失败：${error instanceof Error ? error.message : "网络异常"}`);
  }
  if (!response.ok) throw new BadRequestException(`企业微信智能机器人接口请求失败（HTTP ${response.status}）`);
  try {
    return await response.json() as T;
  } catch {
    throw new BadRequestException("企业微信智能机器人接口返回了无法识别的数据");
  }
}
