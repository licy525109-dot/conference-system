import * as XLSX from "xlsx";
import type { CertificateConfig } from "@conference/shared";

export const CERTIFICATE_COLUMNS = [
  { key: "name", label: "姓名", aliases: ["姓名", "嘉宾姓名", "学员姓名", "name"] },
  { key: "organization", label: "单位", aliases: ["单位", "机构", "公司", "organization"] },
  { key: "role", label: "职务", aliases: ["职务", "身份", "role"] },
  { key: "certificateNo", label: "证书编号", aliases: ["证书编号", "编号", "certificateNo"] },
  { key: "claimCode", label: "领取码", aliases: ["领取码", "查询码", "claimCode"] },
  { key: "eligible", label: "发证资格", aliases: ["发证资格", "资格", "eligible"] },
  { key: "externalId", label: "唯一外部标识", aliases: ["唯一外部标识", "唯一标识", "externalId"] },
];
export function readCertificateSheet(value: ArrayBuffer | string) {
  const book = XLSX.read(value, { type: typeof value === "string" ? "string" : "array", raw: true, sheetRows: 2002, cellFormula: false, cellHTML: false });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", raw: false });
  if (rows.length < 2 || rows.length > 2001) throw new Error("每批需要 1 至 2000 条名单，第一行为表头");
  return rows.map(row => row.map(cell => String(cell ?? "").trim()));
}
export function defaultCertificateMapping(headers: string[], config: CertificateConfig) {
  const mapping: Record<string, string> = {};
  for (const c of [...CERTIFICATE_COLUMNS, ...config.customFields.map(f => ({ key: `custom.${f.key}`, aliases: [f.key, f.label] }))]) {
    const index = headers.findIndex(h => c.aliases.some(a => a.toLowerCase() === h.toLowerCase()));
    mapping[c.key] = index < 0 ? "" : String(index);
  }
  return mapping;
}
export function mapCertificateRows(sheet: string[][], mapping: Record<string, string>, config: CertificateConfig, templateId: string) {
  if (mapping.name === undefined || mapping.name === "") throw new Error("请映射姓名列");
  const value = (row: string[], key: string) => mapping[key] === "" || mapping[key] === undefined ? "" : row[Number(mapping[key])] ?? "";
  return sheet.slice(1).filter(row => row.some(Boolean)).map(row => {
    const eligible = value(row, "eligible");
    if (eligible && !["是", "否", "已确认", "待确认", "true", "false", "1", "0"].includes(eligible)) throw new Error("发证资格仅支持是/否、已确认/待确认、true/false 或 1/0");
    return { templateId, name: value(row, "name"), organization: value(row, "organization"), role: value(row, "role"), certificateNo: value(row, "certificateNo"), claimCode: value(row, "claimCode"), externalId: value(row, "externalId"), eligible: ["是", "已确认", "true", "1"].includes(eligible), custom: Object.fromEntries(config.customFields.map(f => [f.key, value(row, `custom.${f.key}`)])) };
  });
}
export function downloadCertificateSheet(name: string, rows: Record<string, unknown>[]) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "证书名单"); XLSX.writeFile(book, `${name}.xlsx`);
}
