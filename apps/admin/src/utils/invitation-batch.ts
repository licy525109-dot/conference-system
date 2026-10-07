import { invitationNameKey, type InvitationInvitee } from "@conference/shared";
import type { RosterSheet } from "./invitation-roster";

export interface BatchMapping {
  start: number;
  name: number;
  salutation: number;
  organization: number;
}
export interface BatchPreviewRow {
  row: number;
  name: string;
  salutation: string;
  organization: string;
  publicInviteeId: string;
  candidates: InvitationInvitee[];
  issue: string;
}
export function prepareInvitationBatch(
  sheet: RosterSheet,
  mapping: BatchMapping,
  roster: InvitationInvitee[],
  defaultSalutation: string,
) {
  if (sheet.truncated)
    throw new Error("工作表超出读取范围，请缩小名单后重新上传");
  if (mapping.name < 0) throw new Error("请选择姓名列");
  const columns = [
    mapping.name,
    mapping.salutation,
    mapping.organization,
  ].filter((index) => index >= 0);
  if (new Set(columns).size !== columns.length)
    throw new Error("姓名、称谓和单位不能使用同一列");
  const rows: BatchPreviewRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  sheet.rows.slice(mapping.start).forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return;
    const clean = (column: number) => (cells[column] || "").trim();
    const name = clean(mapping.name),
      salutation =
        mapping.salutation >= 0
          ? clean(mapping.salutation)
          : defaultSalutation.trim(),
      organization = clean(mapping.organization);
    const identity = JSON.stringify([
      invitationNameKey(name),
      invitationNameKey(organization),
      salutation,
    ]);
    if (seen.has(identity)) {
      duplicates++;
      return;
    }
    seen.add(identity);
    const candidates = roster.filter(
      (person) => invitationNameKey(person.name) === invitationNameKey(name),
    );
    const matchingOrganization = candidates.filter(
      (person) =>
        organization &&
        invitationNameKey(person.organization) ===
          invitationNameKey(organization),
    );
    const match =
      candidates.length === 1
        ? candidates[0]
        : matchingOrganization.length === 1
          ? matchingOrganization[0]
          : undefined;
    const issue = !name
      ? "缺少姓名"
      : name.length > 80 || salutation.length > 40 || organization.length > 200
        ? "字段过长"
        : /[\u0000-\u001f\u007f]/.test(name + salutation + organization)
          ? "含有控制字符"
          : "";
    rows.push({
      row: mapping.start + index + 1,
      name,
      salutation,
      organization,
      candidates,
      publicInviteeId: match?.id || "",
      issue,
    });
  });
  if (rows.length > 200)
    throw new Error("每批最多 200 位嘉宾，请拆分表格或选择部分公开名单");
  return { rows, duplicates };
}
export function invitationBatchCsv(
  rows: Array<{ name: string; salutation: string; shareUrl: string }>,
) {
  const cell = (value: string) =>
    `"${(/^[\s]*[=+\-@]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return (
    "\ufeff" +
    [
      ["姓名", "称谓", "专属邀请链接"],
      ...rows.map((row) => [row.name, row.salutation, row.shareUrl]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
