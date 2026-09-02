export const GUEST_SCHEDULE_TEMPLATE_CODE = "GUEST_SCHEDULE_UPDATED";
export const GUEST_SCHEDULE_PAGE = "pages/registrations/schedule";

export const DEFAULT_GUEST_FIELD_MAPPING = {
  attendeeId: "系统参会人ID",
  registrationNo: "报名编号",
  conferenceId: "会议ID",
  conferenceTitle: "会议名称",
  name: "姓名",
  phone: "手机号",
  company: "公司",
  title: "职务",
  skuName: "票种",
  registrationStatus: "报名状态",
  syncedAt: "系统同步时间"
} as const;

export const DEFAULT_ASSIGNMENT_FIELD_MAPPING = {
  assignmentId: "系统事项ID",
  attendeeId: "系统参会人ID",
  name: "姓名",
  phone: "手机号",
  type: "事项类型",
  activityName: "事项名称",
  startsAt: "开始时间",
  endsAt: "结束时间",
  location: "地点",
  role: "角色",
  tableNo: "桌号",
  isTableLeader: "是否桌长",
  shareTopic: "分享主题",
  notes: "备注",
  publishState: "后台发布状态",
  syncedAt: "后台同步时间"
} as const;

export type GuestFieldMapping = Record<keyof typeof DEFAULT_GUEST_FIELD_MAPPING, string>;
export type AssignmentFieldMapping = Record<keyof typeof DEFAULT_ASSIGNMENT_FIELD_MAPPING, string>;

export const GUEST_SCHEDULE_TYPE_LABELS = {
  WORKSHOP: "工作坊",
  DINNER: "晚宴",
  SPEECH: "分享演讲",
  REHEARSAL: "彩排",
  RECEPTION: "接待",
  OTHER: "其他"
} as const;

export function mergeFieldMapping<TMapping extends Record<string, string>>(
  defaults: TMapping,
  value: unknown
): TMapping {
  if (!isRecord(value)) return { ...defaults };
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof TMapping>) {
    const next = value[String(key)];
    if (typeof next === "string" && next.trim()) {
      result[key] = next.trim() as TMapping[keyof TMapping];
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
