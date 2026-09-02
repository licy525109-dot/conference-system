import { BadRequestException } from "@nestjs/common";
import type { WecomSmartSheetRecord } from "../wecom/adapters/wecom-client.adapter";

export const SMART_SHEET_TRANSPORT = {
  API: "API",
  WEBHOOK_AUTOMATION: "WEBHOOK_AUTOMATION"
} as const;

export type SmartSheetTransport = typeof SMART_SHEET_TRANSPORT[keyof typeof SMART_SHEET_TRANSPORT];

export interface SmartSheetWebhookSchema {
  version: 1;
  schema: Record<string, string>;
  sampleValues: Record<string, unknown>;
}

export function readSmartSheetTransport(value: unknown): SmartSheetTransport {
  if (value === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION) return SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION;
  return SMART_SHEET_TRANSPORT.API;
}

export function parseSmartSheetWebhookSample(input: unknown): SmartSheetWebhookSchema {
  const parsed = parseJsonInput(input, "示例 JSON");
  const sampleValues = readSampleValues(parsed);
  const normalizedSchema = normalizeWebhookSchema(parsed.schema, sampleValues);
  const entries = Object.entries(normalizedSchema);
  if (!entries.length) throw new BadRequestException("示例 JSON 的 schema 不能为空");
  if (entries.length > 500) throw new BadRequestException("示例 JSON 字段数量不能超过 500 个");

  return { version: 1, schema: normalizedSchema, sampleValues };
}

export function normalizeSmartSheetWebhookSchema(value: unknown): SmartSheetWebhookSchema {
  if (isRecord(value) && value.version === 1 && isRecord(value.schema)) {
    return parseSmartSheetWebhookSample({
      schema: value.schema,
      add_records: [{ values: isRecord(value.sampleValues) ? value.sampleValues : {} }]
    });
  }
  return parseSmartSheetWebhookSample(value);
}

export function formatSmartSheetWebhookSample(value: SmartSheetWebhookSchema): string {
  return JSON.stringify({ schema: value.schema, add_records: [{ values: value.sampleValues }] }, null, 2);
}

export function smartSheetWebhookFields(value: SmartSheetWebhookSchema) {
  return Object.entries(value.schema).map(([id, title]) => ({
    id,
    title,
    type: inferSampleType(value.sampleValues[id])
  }));
}

export function buildSmartSheetWebhookValues(
  valuesByTitle: Record<string, unknown>,
  schema: SmartSheetWebhookSchema
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [fieldId, title] of Object.entries(schema.schema)) {
    if (!Object.prototype.hasOwnProperty.call(valuesByTitle, title)) continue;
    values[fieldId] = adaptWebhookValue(valuesByTitle[title], schema.sampleValues[fieldId]);
  }
  return values;
}

export function parseSmartSheetAutomationPayload(
  input: unknown,
  schema: SmartSheetWebhookSchema
): WecomSmartSheetRecord[] {
  const root = parseJsonInput(input, "自动化回调数据");
  const candidates = readAutomationCandidates(root);
  if (!candidates.length) throw new BadRequestException("自动化回调没有记录数据");
  if (candidates.length > 100) throw new BadRequestException("单次自动化回调最多接收 100 行");

  return candidates.map((candidate, index) => {
    const record = readRecord(candidate, `第 ${index + 1} 行必须是 JSON 对象`);
    const recordId = readString(record.record_id) || readString(record.recordId);
    if (!recordId) throw new BadRequestException(`第 ${index + 1} 行缺少 record_id`);
    const rawValues = readRecordOrJson(record.values ?? record.fields, `第 ${index + 1} 行缺少 values`);
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawValues)) {
      values[schema.schema[key] || key] = value;
    }
    if (!Object.keys(values).length) throw new BadRequestException(`第 ${index + 1} 行 values 不能为空`);
    const updateTime = record.update_time ?? record.updateTime ?? Date.now();
    return { record_id: recordId, update_time: normalizeTimestamp(updateTime), values };
  });
}

export function validateSmartSheetWebhookUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new BadRequestException("接收外部数据 Webhook URL 格式不正确");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "qyapi.weixin.qq.com"
    || url.pathname !== "/cgi-bin/wedoc/smartsheet/webhook"
    || !url.searchParams.get("key")
  ) {
    throw new BadRequestException("请粘贴企业微信智能表“接收外部数据”生成的完整 Webhook URL");
  }
  url.hash = "";
  return url.toString();
}

function readSampleValues(root: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["add_records", "update_records", "records"]) {
    const records = root[key];
    if (!Array.isArray(records) || !records.length || !isRecord(records[0])) continue;
    const values = records[0].values;
    if (isRecord(values)) return values;
  }
  return {};
}

function normalizeWebhookSchema(value: unknown, sampleValues: Record<string, unknown>): Record<string, string> {
  const entries = readWebhookSchemaEntries(value);
  const normalized: Record<string, string> = {};
  const seenTitles = new Set<string>();
  const unsupported: string[] = [];

  for (const [outerKey, rawDescriptor] of entries) {
    let fieldId = outerKey.trim();
    let title = "";
    if (typeof rawDescriptor === "string") {
      const rawText = rawDescriptor.trim();
      if (Object.prototype.hasOwnProperty.call(sampleValues, rawText)
        && !Object.prototype.hasOwnProperty.call(sampleValues, fieldId)) {
        fieldId = rawText;
        title = outerKey.trim();
      } else {
        title = rawText;
      }
    } else if (isRecord(rawDescriptor) || Array.isArray(rawDescriptor)) {
      fieldId = readSchemaDescriptorText(rawDescriptor, ["field_id", "fieldId", "id"]) || fieldId;
      title = readSchemaDescriptorText(rawDescriptor, [
        "field_title",
        "fieldTitle",
        "field_name",
        "fieldName",
        "title",
        "name",
        "label",
        "display_name",
        "displayName"
      ]);
      if (!title && fieldId !== outerKey && Object.prototype.hasOwnProperty.call(sampleValues, fieldId)) {
        title = outerKey.trim();
      }
      if (!title && Object.prototype.hasOwnProperty.call(sampleValues, fieldId)) {
        title = readNestedSchemaText(rawDescriptor, 0);
      }
    }

    if (!fieldId || !title) {
      unsupported.push(outerKey || `#${unsupported.length + 1}`);
      continue;
    }
    if (fieldId.length > 128 || title.length > 128) throw new BadRequestException("schema 字段 ID 或名称过长");
    if (seenTitles.has(title)) throw new BadRequestException(`示例 JSON 中存在重名字段“${title}”，无法安全映射`);
    normalized[fieldId] = title;
    seenTitles.add(title);
  }

  if (!Object.keys(normalized).length) {
    const hint = unsupported.length ? `（未识别：${unsupported.slice(0, 3).join("、")}）` : "";
    throw new BadRequestException(`无法从 schema 识别字段 ID 和字段名称${hint}，请粘贴企微生成的完整示例 JSON`);
  }
  return normalized;
}

function readWebhookSchemaEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index + 1), item]);
  const schema = readRecord(value, "示例 JSON 缺少 schema 字段");
  for (const key of ["fields", "columns"]) {
    if (Array.isArray(schema[key])) return schema[key].map((item, index) => [String(index + 1), item]);
    if (isRecord(schema[key])) return Object.entries(schema[key]);
  }
  return Object.entries(schema);
}

function readSchemaDescriptorText(value: unknown, keys: string[], depth = 0): string {
  if (depth >= 4 || value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = readSchemaDescriptorText(item, keys, depth + 1);
      if (text) return text;
    }
    return "";
  }
  if (!isRecord(value)) return "";
  for (const key of keys) {
    const text = readNestedSchemaText(value[key], depth + 1);
    if (text) return text;
  }
  for (const nested of Object.values(value)) {
    const text = readSchemaDescriptorText(nested, keys, depth + 1);
    if (text) return text;
  }
  return "";
}

function readNestedSchemaText(value: unknown, depth: number): string {
  if (typeof value === "string") return value.trim();
  if (depth >= 3 || value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = readNestedSchemaText(item, depth + 1);
      if (text) return text;
    }
    return "";
  }
  if (isRecord(value)) {
    for (const key of ["text", "value", "title", "name", "label"]) {
      const text = readNestedSchemaText(value[key], depth + 1);
      if (text) return text;
    }
  }
  return "";
}

function readAutomationCandidates(root: Record<string, unknown>): unknown[] {
  for (const key of ["records", "update_records", "add_records"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  if (isRecord(root.data)) return readAutomationCandidates(root.data);
  return [root];
}

function adaptWebhookValue(value: unknown, sample: unknown): unknown {
  const text = readCellText(value);
  if (typeof sample === "boolean") return readBoolean(value);
  if (typeof sample === "number") return readNumberOrTimestamp(value, sample);
  if (typeof sample === "string") {
    if (/^\d{10,13}$/.test(sample) && text) {
      const time = Date.parse(text);
      if (Number.isFinite(time)) return sample.length === 10 ? String(Math.floor(time / 1000)) : String(time);
    }
    return text;
  }
  if (Array.isArray(sample)) {
    if (!sample.length) return text ? [{ text }] : [];
    const template = sample[0];
    if (isRecord(template)) return text ? [replaceTemplateValue(template, text)] : [];
    return text ? [text] : [];
  }
  if (isRecord(sample)) return replaceTemplateValue(sample, text);
  return text;
}

function replaceTemplateValue(template: Record<string, unknown>, text: string): Record<string, unknown> {
  const value = { ...template };
  for (const key of ["text", "value", "title", "name"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      value[key] = text;
      return value;
    }
  }
  for (const key of ["timestamp", "number"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const parsed = Date.parse(text);
      value[key] = Number.isFinite(parsed) ? parsed : Number(text);
      return value;
    }
  }
  return { ...value, text };
}

function readCellText(value: unknown): string {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map(readCellText).filter(Boolean).join("、");
  if (isRecord(value)) {
    for (const key of ["text", "value", "title", "name", "timestamp", "number"]) {
      const text = readCellText(value[key]);
      if (text) return text;
    }
  }
  return "";
}

function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["true", "yes", "1", "是", "桌长"].includes(readCellText(value).toLowerCase());
}

function readNumberOrTimestamp(value: unknown, sample: number): number {
  const text = readCellText(value);
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  const timestamp = Date.parse(text);
  if (Number.isFinite(timestamp)) return sample < 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
  return 0;
}

function inferSampleType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null || typeof value === "undefined") return "unknown";
  return typeof value;
}

function normalizeTimestamp(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return Date.now();
}

function parseJsonInput(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "string") {
    if (value.length > 1_000_000) throw new BadRequestException(`${label}不能超过 1 MB`);
    try {
      return readRecord(JSON.parse(value), `${label}必须是 JSON 对象`);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`${label}格式不正确`);
    }
  }
  return readRecord(value, `${label}必须是 JSON 对象`);
}

function readRecordOrJson(value: unknown, message: string): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return readRecord(JSON.parse(value), message);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(message);
    }
  }
  return readRecord(value, message);
}

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException(message);
  return value;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
