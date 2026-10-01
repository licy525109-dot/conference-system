import { invitationNameKey, type InvitationInvitee } from "@conference/shared";

export interface RosterSheet {
  name: string;
  rows: string[][];
  truncated: boolean;
}
export interface RosterMapping {
  header: number;
  name: number;
  organization: number;
  role: number;
}
const aliases = {
  name: [
    "姓名",
    "嘉宾姓名",
    "受邀人",
    "受邀人姓名",
    "参会人",
    "名字",
    "name",
    "guestname",
    "fullname",
  ],
  organization: [
    "单位",
    "机构",
    "机构名称",
    "单位名称",
    "公司",
    "公司名称",
    "学校",
    "学校名称",
    "organization",
    "company",
    "institution",
  ],
  role: ["职务", "职位", "头衔", "身份", "职称", "role", "title", "position"],
};
const headerKey = (value: string) =>
  invitationNameKey(value).replace(/[()（）:：*]/g, "");
export function detectRosterMapping(rows: string[][]): RosterMapping {
  let best: RosterMapping = { header: 0, name: -1, organization: -1, role: -1 };
  let bestScore = 0;
  rows.slice(0, 20).forEach((row, header) => {
    const mapping = { header, name: -1, organization: -1, role: -1 };
    for (const key of ["name", "organization", "role"] as const)
      mapping[key] = row.findIndex((cell) =>
        aliases[key].includes(headerKey(cell)),
      );
    const score =
      (mapping.name >= 0 ? 4 : 0) +
      (mapping.organization >= 0 ? 2 : 0) +
      (mapping.role >= 0 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = mapping;
    }
  });
  return best;
}
export function rosterIdentity(
  row: Pick<InvitationInvitee, "name" | "organization">,
) {
  return JSON.stringify([
    invitationNameKey(row.name),
    invitationNameKey(row.organization),
  ]);
}
export async function prepareRosterRows(
  sheet: RosterSheet,
  mapping: RosterMapping,
  existing: InvitationInvitee[],
) {
  if (sheet.truncated)
    throw new Error("工作表超出读取范围，请仅保留需要公开的名单后再上传");
  if (mapping.name < 0) throw new Error("请选择姓名列");
  const selected = [mapping.name, mapping.organization, mapping.role].filter(
    (index) => index >= 0,
  );
  if (new Set(selected).size !== selected.length)
    throw new Error("姓名、单位和职务不能使用同一列");
  const items: InvitationInvitee[] = [];
  const issues: Array<{ row: number; reason: string }> = [];
  let duplicates = 0;
  const seen = new Map<string, string>();
  const conflictingExisting = new Set(
    existing
      .filter(
        (item, index) =>
          existing.findIndex(
            (other) => rosterIdentity(other) === rosterIdentity(item),
          ) !== index,
      )
      .map(rosterIdentity),
  );
  const known = new Map(
    existing
      .filter((item) => item.name)
      .map((item) => [rosterIdentity(item), item.id]),
  );
  for (const [index, row] of sheet.rows.entries()) {
    if (index <= mapping.header || row.every((cell) => !cell.trim())) continue;
    const clean = (column: number) =>
      (row[column] || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    const name = clean(mapping.name),
      organization = clean(mapping.organization),
      role = clean(mapping.role);
    if (
      !name ||
      name.length > 80 ||
      organization.length > 200 ||
      role.length > 100
    ) {
      issues.push({ row: index + 1, reason: !name ? "缺少姓名" : "字段过长" });
      continue;
    }
    const identity = rosterIdentity({ name, organization });
    if (conflictingExisting.has(identity))
      throw new Error(
        `第 ${index + 1} 行与现有同姓名、同单位的多条记录重合，请先在名单中确认`,
      );
    if (seen.has(identity)) {
      if (seen.get(identity) !== role)
        throw new Error(
          `第 ${index + 1} 行姓名和单位重复但职务不同，请确认后重新导入`,
        );
      duplicates++;
      continue;
    }
    seen.set(identity, role);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(identity),
    );
    const id =
      known.get(identity) ||
      `roster_${Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32)}`;
    items.push({ id, name, organization, role });
  }
  if (items.length > 500)
    throw new Error("每场会议最多公开 500 位嘉宾，请拆分名单");
  return { items, issues, duplicates };
}
export function mergeRosterRows(
  existing: InvitationInvitee[],
  incoming: InvitationInvitee[],
  mode: "merge" | "replace",
) {
  if (mode === "replace") return incoming;
  const result = existing.map((item) => ({ ...item }));
  const indexes = new Map(
    result.map((item, index) => [rosterIdentity(item), index]),
  );
  for (const item of incoming) {
    const index = indexes.get(rosterIdentity(item));
    if (index === undefined) {
      indexes.set(rosterIdentity(item), result.length);
      result.push(item);
    } else result[index] = { ...item, id: result[index]!.id };
  }
  if (result.length > 500)
    throw new Error("合并后超过 500 位嘉宾，请调整导入方式或清理名单");
  return result;
}
