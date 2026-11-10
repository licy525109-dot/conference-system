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

export interface ExternalCheckinExistingRow { id: string; values: ExternalCheckinValues; checkedInAt: string | null }
export interface ExternalCheckinImportCandidate {
  id: string; source: "existing" | "incoming"; row: number | null; attendeeId: string | null;
  values: ExternalCheckinValues; checkedInAt: string | null;
}
export interface ExternalCheckinDuplicateGroup {
  id: string; matchValues: ExternalCheckinValues; differingFields: string[];
  candidates: ExternalCheckinImportCandidate[]; selectedCandidateId: string | null;
}
export interface ExternalCheckinImportDecision { groupId: string; keepCandidateId: string }
export interface ExternalCheckinImportPlan {
  added: number; updated: number; skipped: number; unresolved: number;
  duplicates: ExternalCheckinDuplicateGroup[]; errors: { row: number; message: string }[];
}

const sameValues = (a: ExternalCheckinValues, b: ExternalCheckinValues, fields: ExternalCheckinField[]) =>
  fields.every(field => externalCheckinText(a[field.key] || "") === externalCheckinText(b[field.key] || ""));

/** Pure resolution shared by the preview UI and authoritative server planner. */
export function resolveExternalCheckinDuplicates(groups: ExternalCheckinDuplicateGroup[], fields: ExternalCheckinField[], input: unknown = []) {
  if (!Array.isArray(input) || input.length > EXTERNAL_CHECKIN_MAX_ROWS) throw new Error("重复记录的保留选择无效");
  const decisions = new Map<string, string>(), byId = new Map(groups.map(group => [group.id, group]));
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("重复记录的保留选择无效");
    const { groupId, keepCandidateId } = item as Record<string, unknown>;
    if (typeof groupId !== "string" || typeof keepCandidateId !== "string" || decisions.has(groupId)) throw new Error("每组重复记录只能选择保留一条");
    const group = byId.get(groupId);
    if (!group || !group.candidates.some(candidate => candidate.id === keepCandidateId)) throw new Error("保留的记录不属于当前重复组，请重新预检");
    decisions.set(groupId, keepCandidateId);
  }
  const additions: ExternalCheckinValues[] = [], updates: { id: string; values: ExternalCheckinValues }[] = [];
  let skipped = 0, unresolved = 0;
  const duplicates = groups.map(group => {
    const selectedCandidateId = decisions.get(group.id) || null;
    const selected = group.candidates.find(candidate => candidate.id === selectedCandidateId);
    if (!selected) unresolved++;
    else {
      const previous = group.candidates.find(candidate => candidate.source === "existing");
      const incomingCount = group.candidates.filter(candidate => candidate.source === "incoming").length;
      if (!previous) { additions.push(selected.values); skipped += incomingCount - 1; }
      else if (selected.source === "existing" || sameValues(previous.values, selected.values, fields)) skipped += incomingCount;
      else { updates.push({ id: previous.attendeeId!, values: selected.values }); skipped += incomingCount - 1; }
    }
    return { ...group, selectedCandidateId };
  });
  return { added: additions.length, updated: updates.length, skipped, unresolved, duplicates, additions, updates };
}

export function planExternalCheckinImport(input: unknown, fields: ExternalCheckinField[], existing: ExternalCheckinExistingRow[], options: { rowNumbers?: unknown; decisions?: unknown } = {}) {
  if (!Array.isArray(input) || input.length < 1 || input.length > EXTERNAL_CHECKIN_MAX_ROWS) throw new Error(`每批请导入 1–${EXTERNAL_CHECKIN_MAX_ROWS} 行名单`);
  const rowNumbers = options.rowNumbers === undefined ? input.map((_, index) => index + 2) : options.rowNumbers;
  if (!Array.isArray(rowNumbers) || rowNumbers.length !== input.length || rowNumbers.some((row, index) => !Number.isSafeInteger(row) || row < 1 || row > 1_048_576 || (index > 0 && row <= rowNumbers[index - 1]))) throw new Error("来源行号无效，请重新选择名单文件");
  const known = new Map<string, ExternalCheckinImportCandidate>();
  for (const record of existing) {
    const values = parseExternalCheckinValues(record.values, fields), identity = externalCheckinIdentity(values, fields);
    if (known.has(identity)) throw new Error("现有名单存在重复核验信息，请检查核验字段配置");
    known.set(identity, { id: `existing:${record.id}`, source: "existing", attendeeId: record.id, row: null, values, checkedInAt: record.checkedInAt });
  }
  const grouped = new Map<string, { firstIndex: number; candidates: ExternalCheckinImportCandidate[] }>();
  const errors: ExternalCheckinImportPlan["errors"] = [];
  input.forEach((row, index) => {
    try {
      const values = parseExternalCheckinValues(row, fields), identity = externalCheckinIdentity(values, fields);
      const group = grouped.get(identity) || { firstIndex: index, candidates: known.has(identity) ? [known.get(identity)!] : [] };
      group.candidates.push({ id: `incoming:${index}`, source: "incoming", row: rowNumbers[index], attendeeId: null, values, checkedInAt: null });
      grouped.set(identity, group);
    } catch (error) { errors.push({ row: rowNumbers[index], message: error instanceof Error ? error.message : "名单格式无效" }); }
  });
  const singles: ExternalCheckinValues[] = [], duplicates: ExternalCheckinDuplicateGroup[] = [];
  for (const group of grouped.values()) {
    if (group.candidates.length === 1) { singles.push(group.candidates[0].values); continue; }
    duplicates.push({
      id: `duplicate:${group.firstIndex}`, candidates: group.candidates, selectedCandidateId: null,
      matchValues: Object.fromEntries(fields.filter(field => field.match).map(field => [field.key, group.candidates[0].values[field.key]])),
      differingFields: fields.filter(field => new Set(group.candidates.map(candidate => candidate.values[field.key] || "")).size > 1).map(field => field.key)
    });
  }
  const resolution = resolveExternalCheckinDuplicates(duplicates, fields, options.decisions);
  return { ...resolution, added: singles.length + resolution.added, errors, additions: [...singles, ...resolution.additions] };
}
