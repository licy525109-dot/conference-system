export type CertificateFieldKey = "name" | "organization" | "role" | "certificateNo" | "issueDate" | "literal" | `custom.${string}`;
export interface CertificateTextField {
  id: string; key: CertificateFieldKey; label: string; text: string;
  x: number; y: number; size: number; color: string;
  align: "start" | "middle" | "end"; weight: 400 | 700;
  maxWidth: number; maxLines: number; lineHeight: number;
}
export interface CertificateTemplate {
  id: string; name: string; width: number; height: number;
  assetId: string | null; fontAssetId: string | null; fontFamily: string;
  fields: CertificateTextField[];
}
export interface CertificateConfig {
  schemaVersion: 1; name: string; title: string; description: string; contact: string; numberPrefix: string;
  primaryColor: string; backgroundAssetId: string | null; issueDate: string;
  customFields: { key: string; label: string }[];
  queryFields: { key: string; label: string; required: boolean }[];
  eligibility: { mode: "approved" | "all" | "conditions"; match: "all" | "any"; conditions: { field: string; operator: "equals" | "in" | "notEmpty"; value: string }[] };
  startsAt: string | null; endsAt: string | null; allowRepeatDownload: boolean;
  notFoundMessage: string; templates: CertificateTemplate[];
}
export interface CertificatePerson {
  name: string; organization: string; role: string; certificateNo: string;
  custom: Record<string, string>;
}
export function certificatePreviewPerson(config: Pick<CertificateConfig, "numberPrefix">, person?: CertificatePerson): CertificatePerson {
  return person ?? { name: "预览姓名", organization: "预览单位", role: "", certificateNo: `${config.numberPrefix}000000000001`, custom: {} };
}
export const CERTIFICATE_QUERY_FIELDS = [
  { key: "name", label: "姓名" }, { key: "organization", label: "单位" },
  { key: "certificateNo", label: "证书编号" }, { key: "claimCode", label: "领取码" },
] as const;

export function defaultCertificateConfig(name = "新会议证书"): CertificateConfig {
  const field = (id: string, key: CertificateFieldKey, y: number, size: number, text = ""): CertificateTextField => ({ id, key, label: id, text, x: 50, y, size, color: "#202a37", align: "middle", weight: 400, maxWidth: 85, maxLines: 2, lineHeight: 1.4 });
  return {
    schemaVersion: 1, name, title: "证书查询与领取", description: "请填写查询信息，领取本次会议的证书。", contact: "如需更正资料，请联系会议工作人员。", numberPrefix: "CERT-",
    primaryColor: "#245fc8", backgroundAssetId: null, issueDate: "", customFields: [],
    queryFields: [{ key: "name", label: "姓名", required: true }, { key: "claimCode", label: "领取码", required: true }],
    eligibility: { mode: "approved", match: "all", conditions: [] }, startsAt: null, endsAt: null, allowRepeatDownload: true,
    notFoundMessage: "未查询到符合条件的证书，请检查信息或联系会务组。",
    templates: [{ id: "default", name: "参会证明", width: 1600, height: 1132, assetId: null, fontAssetId: null, fontFamily: "sans-serif", fields: [field("title", "literal", 22, 80, "参会证明"), field("name", "name", 48, 64), field("number", "certificateNo", 70, 30), field("date", "issueDate", 80, 28)] }],
  };
}

export function normalizeCertificateLookup(value: unknown): string {
  return String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}
export function certificateValue(data: CertificatePerson, key: string): string {
  return key.startsWith("custom.") ? data.custom[key.slice(7)] ?? "" : String(data[key as keyof CertificatePerson] ?? "");
}
export function certificateEligible(config: CertificateConfig, data: CertificatePerson, approved: boolean): boolean {
  const e = config.eligibility;
  if (e.mode === "approved") return approved;
  if (e.mode === "all") return true;
  if (!e.conditions.length) return false;
  const values = e.conditions.map(c => {
    const v = normalizeCertificateLookup(certificateValue(data, c.field));
    return c.operator === "notEmpty" ? Boolean(v) : c.operator === "in" ? c.value.split(/[\n,，]/).some(item => normalizeCertificateLookup(item) === v) : v === normalizeCertificateLookup(c.value);
  });
  return e.match === "all" ? values.every(Boolean) : values.some(Boolean);
}

export function validateCertificateConfig(raw: unknown): CertificateConfig {
  const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("配置格式不正确"); return v as Record<string, unknown>; };
  const text = (v: unknown, max = 200, optional = false) => { if (typeof v !== "string" || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v) || (!optional && !v.trim())) throw new Error(`文字须为${optional ? "不超过" : "1 至"} ${max} 字符，不能包含控制字符`); return v.trim(); };
  const num = (v: unknown, min: number, max: number) => { if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`数值须在 ${min} 至 ${max} 之间`); return v; };
  const bool = (v: unknown) => { if (typeof v !== "boolean") throw new Error("开关值不正确"); return v; };
  const array = (v: unknown, min: number, max: number) => { if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`列表数量须在 ${min} 至 ${max} 之间`); return v as unknown[]; };
  const color = (v: unknown) => { const s = text(v, 7); if (!/^#[0-9a-f]{6}$/i.test(s)) throw new Error("颜色格式不正确"); return s; };
  const id = (v: unknown) => { const s = text(v, 64); if (!/^[a-zA-Z0-9_-]+$/.test(s) || ["__proto__", "prototype", "constructor"].includes(s)) throw new Error("标识须为字母、数字、短横线或下划线组成的非保留名称"); return s; };
  const nullableId = (v: unknown) => v == null || v === "" ? null : id(v);
  const date = (v: unknown) => { if (v == null || v === "") return null; const s = text(v, 40); if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error("时间必须包含时区"); return new Date(s).toISOString(); };
  const unique = (values: string[]) => { if (new Set(values).size !== values.length) throw new Error("标识或字段重复"); };
  const at = <T,>(label: string, read: () => T): T => { try { return read(); } catch (e) { throw new Error(`${label}：${e instanceof Error ? e.message : "配置不正确"}`); } };
  const namedText = (label: string, v: unknown, max = 200, optional = false) => at(label, () => text(v, max, optional));
  const r = obj(raw);
  const customFields = array(r.customFields, 0, 20).map((v, i) => at(`自定义名单字段第 ${i + 1} 项`, () => { const x = obj(v); return { key: at("字段标识", () => id(x.key)), label: namedText("字段名称", x.label, 40) }; }));
  unique(customFields.map(f => f.key));
  unique([...CERTIFICATE_QUERY_FIELDS.map(f => f.label), "职务", "发证资格", "唯一外部标识", "证书类型", ...customFields.map(f => f.label)]);
  const dataKeys = new Set(["name", "organization", "role", "certificateNo", ...customFields.map(f => `custom.${f.key}`)]);
  const queryKeys = new Set([...dataKeys, "claimCode"]);
  const queryFields = array(r.queryFields, 1, 12).map((v, i) => at(`查询条件第 ${i + 1} 项`, () => { const x = obj(v), key = namedText("查询字段", x.key, 80); if (!queryKeys.has(key)) throw new Error("不支持的查询字段"); return { key, label: namedText("显示名称", x.label, 40), required: bool(x.required) }; }));
  unique(queryFields.map(f => f.key));
  const er = obj(r.eligibility);
  if (!["approved", "all", "conditions"].includes(String(er.mode)) || !["all", "any"].includes(String(er.match))) throw new Error("获证规则不正确");
  const conditions = array(er.conditions, er.mode === "conditions" ? 1 : 0, 20).map((v, i) => at(`获证条件第 ${i + 1} 项`, () => { const x = obj(v), field = namedText("条件字段", x.field, 80); if (!dataKeys.has(field) || !["equals", "in", "notEmpty"].includes(String(x.operator))) throw new Error("获证条件不正确"); return { field, operator: x.operator as "equals" | "in" | "notEmpty", value: namedText("条件值", x.value, 1000, x.operator === "notEmpty") }; }));
  const templates = array(r.templates, 1, 10).map((v, i) => {
    const t = obj(v), name = namedText(`证书模板第 ${i + 1} 项 → 类型名称`, t.name, 100);
    return at(`证书模板「${name}」`, () => {
    const fontFamily = namedText("默认字体", t.fontFamily, 100);
    if (!fontFamily.split(",").every(f => /^[\p{L}\p{N} _-]+$/u.test(f.trim()) && f.trim())) throw new Error("字体名称不正确，可用逗号分隔候选字体");
    const tf = array(t.fields, 1, 40).map((v, i) => { const f = obj(v), label = namedText(`文字字段第 ${i + 1} 项 → 字段名称`, f.label, 40); return at(`文字「${label}」`, () => { const key = namedText("文字来源", f.key, 80); if (!dataKeys.has(key) && !["literal", "issueDate"].includes(key)) throw new Error("模板字段不正确"); if (!["start", "middle", "end"].includes(String(f.align)) || ![400, 700].includes(Number(f.weight))) throw new Error("排版格式不正确"); return { id: id(f.id), key: key as CertificateFieldKey, label, text: namedText(key === "literal" ? "固定文字" : "字段前缀", f.text, 1000, true), x: num(f.x, 0, 100), y: num(f.y, 0, 100), size: num(f.size, 8, 300), color: color(f.color), align: f.align as "start" | "middle" | "end", weight: f.weight as 400 | 700, maxWidth: num(f.maxWidth, 1, 100), maxLines: Math.floor(num(f.maxLines, 1, 10)), lineHeight: num(f.lineHeight, 1, 3) }; }); });
    unique(tf.map(f => f.id));
    return { id: id(t.id), name, width: Math.floor(num(t.width, 400, 4000)), height: Math.floor(num(t.height, 300, 4000)), assetId: nullableId(t.assetId), fontAssetId: nullableId(t.fontAssetId), fontFamily, fields: tf };
    });
  });
  unique(templates.map(t => t.id));
  unique(templates.map(t => t.name));
  const startsAt = date(r.startsAt), endsAt = date(r.endsAt);
  if (startsAt && endsAt && startsAt >= endsAt) throw new Error("截止时间必须晚于开放时间");
  return { schemaVersion: 1, name: namedText("项目名称", r.name), title: namedText("查询页面标题", r.title), description: namedText("页面说明", r.description, 2000, true), contact: namedText("联系方式与资料更正说明", r.contact, 500, true), numberPrefix: namedText("基本信息 → 自动编号前缀", r.numberPrefix ?? "CERT-", 32), primaryColor: at("页面主题色", () => color(r.primaryColor)), backgroundAssetId: at("查询页主视觉", () => nullableId(r.backgroundAssetId)), issueDate: namedText("发证日期", r.issueDate, 60, true), customFields, queryFields, eligibility: { mode: er.mode as "approved" | "all" | "conditions", match: er.match as "all" | "any", conditions }, startsAt, endsAt, allowRepeatDownload: bool(r.allowRepeatDownload), notFoundMessage: namedText("未查询到时的提示", r.notFoundMessage, 500), templates };
}
