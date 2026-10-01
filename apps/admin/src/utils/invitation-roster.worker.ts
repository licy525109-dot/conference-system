import { read, utils } from "xlsx";
import type { RosterSheet } from "./invitation-roster";

self.onmessage = (
  event: MessageEvent<{ bytes: ArrayBuffer; filename: string }>,
) => {
  try {
    const { bytes, filename } = event.data;
    let input: ArrayBuffer | string = bytes;
    if (/\.(csv|tsv)$/i.test(filename)) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      input = text.includes("\ufffd")
        ? new TextDecoder("gb18030").decode(bytes)
        : text;
    }
    const workbook = read(input, {
      type: typeof input === "string" ? "string" : "array",
      dense: true,
      sheetRows: 1022,
      cellHTML: false,
      cellFormula: false,
      cellStyles: false,
      raw: true,
    });
    if (workbook.SheetNames.length > 20)
      throw new Error("工作簿超过 20 个工作表，请仅保留名单工作表");
    const sheets: RosterSheet[] = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name]!;
      const range = utils.decode_range(sheet["!ref"] || "A1");
      if (range.e.c > 49)
        throw new Error("表格超过 50 列，请只保留公开名单相关列");
      const rows = utils
        .sheet_to_json<unknown[]>(sheet, {
        header: 1,
        range: 0,
          raw: false,
          defval: "",
          blankrows: true,
        })
        .map((row) => row.map((cell) => String(cell ?? "")));
      const full = utils.decode_range(
        sheet["!fullref"] || sheet["!ref"] || "A1",
      );
      return { name, rows, truncated: full.e.r >= 1022 };
    });
    self.postMessage({ sheets });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "无法识别表格",
    });
  }
};
