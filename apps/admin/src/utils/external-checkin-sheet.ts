import type { ExternalCheckinField, ExternalCheckinValues } from "@conference/shared";
import { EXTERNAL_CHECKIN_MAX_ROWS } from "@conference/shared";

export function mapExternalCheckinSheet(sheet: string[][], mapping: Record<string, string>, fields: ExternalCheckinField[]): ExternalCheckinValues[] {
  return mapExternalCheckinSheetWithRows(sheet, mapping, fields).rows;
}

export function mapExternalCheckinSheetWithRows(sheet: string[][], mapping: Record<string, string>, fields: ExternalCheckinField[]): { rows: ExternalCheckinValues[]; rowNumbers: number[] } {
  const selected = fields.map(field => mapping[field.key]).filter(value => value !== undefined && value !== "");
  if (new Set(selected).size !== selected.length) throw new Error("同一列不能映射到多个字段");
  for (const field of fields) if (field.match && (mapping[field.key] === "" || mapping[field.key] === undefined)) throw new Error(`请选择“${field.label}”对应的名单列`);
  const rows = sheet.slice(1).map((values, index) => ({ values, row: index + 2 })).filter(row => row.values.some(value => value.trim()));
  if (!rows.length || rows.length > EXTERNAL_CHECKIN_MAX_ROWS) throw new Error(`每批名单需要 1–${EXTERNAL_CHECKIN_MAX_ROWS} 行`);
  return {
    rows: rows.map(row => Object.fromEntries(fields.map(field => [field.key, mapping[field.key] === "" || mapping[field.key] === undefined ? "" : row.values[Number(mapping[field.key])] || ""]))),
    rowNumbers: rows.map(row => row.row)
  };
}

export async function readExternalCheckinWorkbook(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("文件不能超过 10 MB，请分批导入");
  const xlsx = await import("xlsx");
  const bytes = await file.arrayBuffer(), options = { raw: true, cellDates: false, sheetRows: EXTERNAL_CHECKIN_MAX_ROWS + 2 };
  let text: string | undefined;
  if (/\.(csv|tsv)$/i.test(file.name)) {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder("gb18030", { fatal: true }).decode(bytes); }
  }
  const workbook = text === undefined ? xlsx.read(bytes, { ...options, type: "array" }) : xlsx.read(text.replace(/^\uFEFF/, ""), { ...options, type: "string" });
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name], range = xlsx.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
    if (range.e.r >= EXTERNAL_CHECKIN_MAX_ROWS + 1 || range.e.c > 99) throw new Error(`工作表“${name}”超过 ${EXTERNAL_CHECKIN_MAX_ROWS} 行或 100 列，请拆分后导入`);
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, range: 0 }).map(row => row.map(value => String(value ?? "")));
    return { name, rows };
  });
}

export async function downloadExternalCheckinSheet(filename: string, rows: string[][]) {
  const xlsx = await import("xlsx"), workbook = xlsx.utils.book_new();
  // Strings remain string cells, including values beginning with =, +, - or @.
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = (rows[0] || []).map(() => ({ wch: 24 }));
  xlsx.utils.book_append_sheet(workbook, sheet, "名单");
  xlsx.writeFile(workbook, `${filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100)}.xlsx`);
}
