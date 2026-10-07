import {
  invitationAssetUrl,
  type InvitationAgendaItem,
} from "@conference/shared";
import type { RosterSheet } from "./invitation-roster";

export const AGENDA_FIELDS = {
  date: "日期",
  time: "时段",
  title: "议题",
  speaker: "嘉宾",
  location: "地点",
  imageUrl: "头像地址",
} as const;
export type AgendaMapping = { header: number } & Record<
  keyof typeof AGENDA_FIELDS,
  number
>;
const aliases = {
  date: ["日期", "天数", "日程日期", "date", "day"],
  time: ["时间", "时段", "开始时间", "time"],
  title: ["议程", "议题", "议程标题", "标题", "主题", "内容", "title", "topic"],
  speaker: ["嘉宾", "分享嘉宾", "主讲人", "演讲者", "speaker"],
  location: ["地点", "会场", "location"],
  imageUrl: ["头像", "头像地址", "嘉宾头像", "imageurl", "portrait"],
};
const fields = Object.keys(AGENDA_FIELDS) as Array<keyof typeof AGENDA_FIELDS>;
export function detectAgendaMapping(rows: string[][]): AgendaMapping {
  let best: AgendaMapping = {
    header: -1,
    date: -1,
    time: 0,
    title: 1,
    speaker: 2,
    location: -1,
    imageUrl: -1,
  };
  let score = 0;
  rows.slice(0, 20).forEach((row, header) => {
    const mapping = { header } as AgendaMapping;
    for (const key of fields)
      mapping[key] = row.findIndex((cell) =>
        aliases[key].includes(cell.trim().toLowerCase().replace(/\s/g, "")),
      );
    const value =
      mapping.title >= 0 &&
      fields.filter((key) => mapping[key] >= 0).length >= 2
        ? 5 + fields.filter((key) => mapping[key] >= 0).length
        : 0;
    if (value > score) {
      best = mapping;
      score = value;
    }
  });
  return best;
}
export function prepareAgendaRows(
  sheet: RosterSheet,
  mapping: AgendaMapping,
  defaultDate: string,
) {
  if (sheet.truncated) throw new Error("工作表过长，请仅保留需要导入的议程");
  if (mapping.title < 0) throw new Error("请选择议题列");
  const columns = fields
    .map((key) => mapping[key])
    .filter((index) => index >= 0);
  if (new Set(columns).size !== columns.length)
    throw new Error("不同字段不能使用同一列");
  const rows: InvitationAgendaItem[] = [],
    issues: Array<{ row: number; reason: string }> = [];
  for (const [index, cells] of sheet.rows.entries()) {
    if (index <= mapping.header || cells.every((cell) => !cell.trim()))
      continue;
    const get = (key: keyof typeof AGENDA_FIELDS) =>
      (cells[mapping[key]] || "").trim();
    const row = {
      id: `import-${index}`,
      date: get("date") || defaultDate,
      time: get("time"),
      title: get("title"),
      speaker: get("speaker"),
      location: get("location"),
      imageUrl: get("imageUrl"),
    };
    const reason = !row.title
      ? "缺少议题"
      : row.date.length > 50 ||
          row.time.length > 50 ||
          row.title.length > 300 ||
          row.speaker.length > 200 ||
          row.location.length > 200
        ? "字段过长"
        : row.imageUrl && !invitationAssetUrl(row.imageUrl)
          ? "头像地址必须为 HTTPS 或素材库地址"
          : "";
    if (reason) issues.push({ row: index + 1, reason });
    else rows.push({ ...row, imageUrl: invitationAssetUrl(row.imageUrl) });
  }
  if (rows.length + issues.length > 150)
    throw new Error("每份邀请函最多 150 条议程");
  return { rows, issues };
}

export function applyAgendaImport(
  existing: InvitationAgendaItem[],
  incoming: InvitationAgendaItem[],
  date: string,
  replace = false,
) {
  if (!replace) return [...existing, ...incoming];
  const index = existing.findIndex((row) => row.date === date);
  const remaining = existing.filter((row) => row.date !== date);
  const insertion =
    index < 0
      ? remaining.length
      : existing.slice(0, index).filter((row) => row.date !== date).length;
  remaining.splice(insertion, 0, ...incoming);
  return remaining;
}
