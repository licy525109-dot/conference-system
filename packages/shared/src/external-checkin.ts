export interface ExternalCheckinField { key: string; label: string; input: boolean; required: boolean; match: boolean }
export type ExternalCheckinValues = Record<string, string>;
export const EXTERNAL_CHECKIN_MAX_ROWS = 5000;
export const EXTERNAL_CHECKIN_MAX_VALUE = 300;

export function externalCheckinText(value: string): string { return value.normalize("NFKC").trim(); }

export function parseExternalCheckinFields(input: unknown): ExternalCheckinField[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) throw new Error("请配置 1–20 个名单字段");
  const keys = new Set<string>(), labels = new Set<string>();
  const fields = input.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("字段配置无效");
    const field = item as Record<string, unknown>;
    if (typeof field.key !== "string" || !/^[a-z][a-z0-9_]{0,39}$/.test(field.key) || ["constructor", "prototype", "__proto__"].includes(field.key)) throw new Error("字段标识无效");
    const label = typeof field.label === "string" ? externalCheckinText(field.label) : "";
    if (!label || label.length > 40 || [field.input, field.required, field.match].some(value => typeof value !== "boolean")) throw new Error("字段名称应为 1–40 个字，并指定填写、必填和核验设置");
    if (field.match && (!field.input || !field.required)) throw new Error("核验字段必须同时启用填写和必填");
    if (field.required && !field.input) throw new Error("必填字段必须启用嘉宾填写");
    if (keys.has(field.key) || labels.has(label)) throw new Error("字段标识和名称不能重复");
    keys.add(field.key); labels.add(label);
    return { key: field.key, label, input: field.input as boolean, required: field.required as boolean, match: field.match as boolean };
  });
  if (!fields.some(field => field.match)) throw new Error("至少指定一个用于匹配名单的核验字段");
  return fields;
}

export function parseExternalCheckinValues(input: unknown, fields: ExternalCheckinField[], publicInput = false): ExternalCheckinValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("名单资料格式无效");
  const source = input as Record<string, unknown>, values: ExternalCheckinValues = {};
  for (const field of fields.filter(field => !publicInput || field.input)) {
    const raw = Object.hasOwn(source, field.key) ? source[field.key] : "";
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw new Error(`${field.label}请使用文本格式`);
    const value = externalCheckinText(typeof raw === "string" ? raw : "");
    if ((field.match || (publicInput && field.required)) && !value) throw new Error(`请填写${field.label}`);
    if (value.length > EXTERNAL_CHECKIN_MAX_VALUE) throw new Error(`${field.label}不能超过 ${EXTERNAL_CHECKIN_MAX_VALUE} 个字`);
    values[field.key] = value;
  }
  return values;
}

export function externalCheckinIdentity(values: ExternalCheckinValues, fields: ExternalCheckinField[]): string {
  return JSON.stringify(fields.filter(field => field.match).map(field => field.key).sort().map(key => [key, externalCheckinText(values[key] || "")]));
}

export interface ExternalCheckinImportPlan {
  added: number; skipped: number; errors: { row: number; message: string }[];
}
export function planExternalCheckinImport(input: unknown, fields: ExternalCheckinField[], existing: ExternalCheckinValues[]) {
  if (!Array.isArray(input) || input.length < 1 || input.length > EXTERNAL_CHECKIN_MAX_ROWS) throw new Error(`每批请导入 1–${EXTERNAL_CHECKIN_MAX_ROWS} 行名单`);
  const known = new Map(existing.map(values => [externalCheckinIdentity(values, fields), values]));
  const additions: ExternalCheckinValues[] = [], errors: ExternalCheckinImportPlan["errors"] = [];
  let skipped = 0;
  const equal = (a: ExternalCheckinValues, b: ExternalCheckinValues) => fields.every(field => externalCheckinText(a[field.key] || "") === externalCheckinText(b[field.key] || ""));
  input.forEach((row, index) => {
    try {
      const values = parseExternalCheckinValues(row, fields), identity = externalCheckinIdentity(values, fields), prior = known.get(identity);
      if (prior) {
        if (equal(prior, values)) skipped++;
        else errors.push({ row: index + 2, message: "核对字段与另一条名单相同，但其余资料不同；请增加核对字段或修正名单" });
      } else { known.set(identity, values); additions.push(values); }
    } catch (error) { errors.push({ row: index + 2, message: error instanceof Error ? error.message : "名单格式无效" }); }
  });
  return { added: additions.length, skipped, errors, additions };
}
