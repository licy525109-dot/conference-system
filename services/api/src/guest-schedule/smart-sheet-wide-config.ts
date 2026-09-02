import { GuestScheduleType } from "@prisma/client";

export const SMART_SHEET_MODE = {
  EXISTING_WIDE_SHEET: "EXISTING_WIDE_SHEET",
  SEPARATE_SHEETS: "SEPARATE_SHEETS"
} as const;

export type SmartSheetMode = (typeof SMART_SHEET_MODE)[keyof typeof SMART_SHEET_MODE];

export interface WideSheetIdentityMapping {
  attendeeIdField: string;
  phoneField: string;
  nameField: string;
  companyField: string;
}

export interface WideSheetRegistrationMapping {
  registrationNoField: string;
  conferenceTitleField: string;
  titleField: string;
  skuNameField: string;
  registrationStatusField: string;
  syncedAtField: string;
}

export interface WideSheetScheduleRule {
  id: string;
  type: GuestScheduleType;
  label: string;
  enabled: boolean;
  triggerField: string;
  activityNameField: string;
  activityNameFallback: string;
  startsAtField: string;
  endsAtField: string;
  locationField: string;
  roleField: string;
  tableNoField: string;
  isTableLeaderField: string;
  shareTopicField: string;
  notesField: string;
}

export interface ExistingWideSheetConfig {
  mode: typeof SMART_SHEET_MODE.EXISTING_WIDE_SHEET;
  identity: WideSheetIdentityMapping;
  writeRegistrationFields: boolean;
  registration: WideSheetRegistrationMapping;
  schedules: WideSheetScheduleRule[];
}

export interface SmartSheetLinkParts {
  docId: string;
  sheetId: string | null;
  viewId: string | null;
  canonicalUrl: string;
}

const SCHEDULE_PRESETS: Array<{ id: string; type: GuestScheduleType; label: string }> = [
  { id: "workshop", type: GuestScheduleType.WORKSHOP, label: "工作坊" },
  { id: "dinner", type: GuestScheduleType.DINNER, label: "晚宴" },
  { id: "speech", type: GuestScheduleType.SPEECH, label: "分享演讲" },
  { id: "rehearsal", type: GuestScheduleType.REHEARSAL, label: "彩排" },
  { id: "reception", type: GuestScheduleType.RECEPTION, label: "接待" },
  { id: "other", type: GuestScheduleType.OTHER, label: "其他事项" }
];

export function createDefaultWideSheetConfig(fieldTitles: string[] = []): ExistingWideSheetConfig {
  const fields = new Set(fieldTitles.map((item) => item.trim()).filter(Boolean));
  return {
    mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
    identity: {
      attendeeIdField: findField(fields, ["系统参会人ID", "参会人ID"]),
      phoneField: findField(fields, ["手机号", "手机号码", "联系电话", "电话"]),
      nameField: findField(fields, ["姓名", "嘉宾姓名", "名字"]),
      companyField: findField(fields, ["公司&品牌缩写", "公司及品牌", "公司", "公司名称", "品牌"])
    },
    writeRegistrationFields: false,
    registration: {
      registrationNoField: findField(fields, ["报名编号", "报名号"]),
      conferenceTitleField: findField(fields, ["会议名称", "活动名称"]),
      titleField: findField(fields, ["职位", "职务"]),
      skuNameField: findField(fields, ["报名票种", "票种", "报名规格"]),
      registrationStatusField: findField(fields, ["报名状态"]),
      syncedAtField: findField(fields, ["系统同步时间", "报名同步时间"])
    },
    schedules: SCHEDULE_PRESETS.map((preset) => suggestedScheduleRule(preset, fields))
  };
}

export function normalizeWideSheetConfig(value: unknown): ExistingWideSheetConfig {
  const defaults = createDefaultWideSheetConfig();
  if (!isRecord(value)) return defaults;
  const identity = isRecord(value.identity) ? value.identity : {};
  const registration = isRecord(value.registration) ? value.registration : {};
  const schedules = Array.isArray(value.schedules)
    ? value.schedules.slice(0, 20).map((item, index) => normalizeScheduleRule(item, index)).filter(Boolean) as WideSheetScheduleRule[]
    : defaults.schedules;
  return {
    mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
    identity: {
      attendeeIdField: readString(identity.attendeeIdField),
      phoneField: readString(identity.phoneField),
      nameField: readString(identity.nameField),
      companyField: readString(identity.companyField)
    },
    writeRegistrationFields: value.writeRegistrationFields === true,
    registration: {
      registrationNoField: readString(registration.registrationNoField),
      conferenceTitleField: readString(registration.conferenceTitleField),
      titleField: readString(registration.titleField),
      skuNameField: readString(registration.skuNameField),
      registrationStatusField: readString(registration.registrationStatusField),
      syncedAtField: readString(registration.syncedAtField)
    },
    schedules: schedules.length ? schedules : defaults.schedules
  };
}

export function readSmartSheetMode(value: unknown): SmartSheetMode {
  return isRecord(value) && value.mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
    ? SMART_SHEET_MODE.EXISTING_WIDE_SHEET
    : SMART_SHEET_MODE.SEPARATE_SHEETS;
}

export function parseSmartSheetLink(value: string): SmartSheetLinkParts {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的企微智能表链接");
  }
  if (url.protocol !== "https:" || url.hostname !== "doc.weixin.qq.com") {
    throw new Error("请输入企业微信官方 doc.weixin.qq.com 智能表链接");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("smartsheet");
  const docId = marker >= 0 ? decodeURIComponent(parts[marker + 1] || "") : "";
  if (!/^s3_[A-Za-z0-9_-]+$/.test(docId)) {
    throw new Error("链接中未识别到有效的企微智能表文档");
  }
  const sheetId = cleanQueryValue(url.searchParams.get("tab"));
  const viewId = cleanQueryValue(url.searchParams.get("viewId"));
  const canonicalUrl = new URL(url.toString());
  canonicalUrl.hash = "";
  canonicalUrl.pathname = `/smartsheet/${encodeURIComponent(docId)}`;
  return { docId, sheetId, viewId, canonicalUrl: canonicalUrl.toString() };
}

export function configuredWideFields(config: ExistingWideSheetConfig): string[] {
  const fields = [
    ...Object.values(config.identity),
    ...(config.writeRegistrationFields ? Object.values(config.registration) : []),
    ...config.schedules.filter((rule) => rule.enabled).flatMap((rule) => [
      rule.triggerField,
      rule.activityNameField,
      rule.startsAtField,
      rule.endsAtField,
      rule.locationField,
      rule.roleField,
      rule.tableNoField,
      rule.isTableLeaderField,
      rule.shareTopicField,
      rule.notesField
    ])
  ];
  return [...new Set(fields.filter(Boolean))];
}

function suggestedScheduleRule(
  preset: { id: string; type: GuestScheduleType; label: string },
  fields: Set<string>
): WideSheetScheduleRule {
  const stem = preset.label === "分享演讲" ? ["分享", "演讲"] : [preset.label];
  const triggerField = findField(fields, stem.flatMap((item) => [`是否参加${item}`, `${item}参与`, `${item}安排`, item]));
  const startsAtField = findField(fields, stem.flatMap((item) => [`${item}开始时间`, `${item}时间`]));
  const activityNameField = findField(fields, stem.flatMap((item) => [`${item}名称`, `${item}主题`]));
  return {
    id: preset.id,
    type: preset.type,
    label: preset.label,
    enabled: Boolean(startsAtField && (triggerField || activityNameField)),
    triggerField,
    activityNameField,
    activityNameFallback: preset.label,
    startsAtField,
    endsAtField: findField(fields, stem.map((item) => `${item}结束时间`)),
    locationField: findField(fields, stem.flatMap((item) => [`${item}地点`, `${item}会场`, `${item}房间`])),
    roleField: findField(fields, stem.map((item) => `${item}角色`)),
    tableNoField: preset.type === GuestScheduleType.DINNER ? findField(fields, ["晚宴桌号", "桌号", "餐桌号"]) : "",
    isTableLeaderField: preset.type === GuestScheduleType.DINNER ? findField(fields, ["是否桌长", "桌长身份", "桌长"]) : "",
    shareTopicField: preset.type === GuestScheduleType.SPEECH ? findField(fields, ["分享主题", "演讲主题", "分享内容"]) : "",
    notesField: findField(fields, stem.flatMap((item) => [`${item}备注`, `${item}说明`]))
  };
}

function normalizeScheduleRule(value: unknown, index: number): WideSheetScheduleRule | null {
  if (!isRecord(value)) return null;
  const type = readScheduleType(value.type);
  if (!type) return null;
  return {
    id: readString(value.id) || `rule-${index + 1}`,
    type,
    label: readString(value.label) || scheduleLabel(type),
    enabled: value.enabled === true,
    triggerField: readString(value.triggerField),
    activityNameField: readString(value.activityNameField),
    activityNameFallback: readString(value.activityNameFallback) || scheduleLabel(type),
    startsAtField: readString(value.startsAtField),
    endsAtField: readString(value.endsAtField),
    locationField: readString(value.locationField),
    roleField: readString(value.roleField),
    tableNoField: readString(value.tableNoField),
    isTableLeaderField: readString(value.isTableLeaderField),
    shareTopicField: readString(value.shareTopicField),
    notesField: readString(value.notesField)
  };
}

function readScheduleType(value: unknown): GuestScheduleType | null {
  return typeof value === "string" && (Object.values(GuestScheduleType) as string[]).includes(value)
    ? value as GuestScheduleType
    : null;
}

function scheduleLabel(type: GuestScheduleType): string {
  return SCHEDULE_PRESETS.find((item) => item.type === type)?.label || "其他事项";
}

function findField(fields: Set<string>, candidates: string[]): string {
  for (const candidate of candidates) {
    if (fields.has(candidate)) return candidate;
  }
  const normalized = [...fields].map((field) => ({ field, normalized: normalizeComparable(field) }));
  for (const candidate of candidates) {
    const target = normalizeComparable(candidate);
    const exact = normalized.find((item) => item.normalized === target);
    if (exact) return exact.field;
  }
  return "";
}

function normalizeComparable(value: string): string {
  return value.replace(/[\s&＆/\\·._-]+/g, "").toLowerCase();
}

function cleanQueryValue(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
