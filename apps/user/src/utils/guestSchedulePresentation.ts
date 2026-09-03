export interface GuestSchedulePresentationSource {
  type: string;
  location?: string | null;
  role?: string | null;
  tableNo?: string | null;
  isTableLeader?: boolean;
  shareTopic?: string | null;
  notes?: string | null;
}

export interface GuestScheduleDisplayField {
  key: "location" | "tableNo" | "tableLeader" | "role" | "shareTopic" | "notes";
  label: string;
  value: string;
  emphasis: boolean;
}

const LOCATION_LABELS: Record<string, string> = {
  WORKSHOP: "工作坊位置",
  DINNER: "晚宴位置",
  SPEECH: "分享地点",
  REHEARSAL: "彩排地点",
  RECEPTION: "接待地点",
  OTHER: "事项地点"
};

const ROLE_LABELS: Record<string, string> = {
  WORKSHOP: "参与身份",
  DINNER: "晚宴身份",
  SPEECH: "分享身份",
  REHEARSAL: "彩排身份",
  RECEPTION: "接待身份",
  OTHER: "参与身份"
};

export function buildGuestScheduleFields(item: GuestSchedulePresentationSource): GuestScheduleDisplayField[] {
  const fields: GuestScheduleDisplayField[] = [];
  pushField(fields, "location", LOCATION_LABELS[item.type] || "事项地点", item.location);
  pushField(fields, "tableNo", "所在桌号", formatTableNo(item.tableNo), true);
  if (item.tableNo || item.isTableLeader) {
    pushField(fields, "tableLeader", "桌长身份", item.isTableLeader ? "本桌桌长" : "非桌长", Boolean(item.isTableLeader));
  }
  pushField(fields, "role", ROLE_LABELS[item.type] || "参与身份", item.role);
  pushField(fields, "shareTopic", item.type === "SPEECH" ? "分享内容" : "参与内容", item.shareTopic);
  pushField(fields, "notes", "会务提醒", item.notes);
  return fields;
}

export function formatTableNo(value?: string | null): string {
  const normalized = value?.trim() || "";
  if (!normalized || normalized.includes("桌")) return normalized;
  return `${normalized} 桌`;
}

function pushField(
  fields: GuestScheduleDisplayField[],
  key: GuestScheduleDisplayField["key"],
  label: string,
  value?: string | null,
  emphasis = false
): void {
  const normalized = value?.trim() || "";
  if (!normalized) return;
  fields.push({ key, label, value: normalized, emphasis });
}
