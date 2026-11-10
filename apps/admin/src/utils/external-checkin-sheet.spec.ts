import assert from "node:assert/strict";
import { it } from "node:test";
import type { ExternalCheckinField } from "@conference/shared";
import { mapExternalCheckinSheet, readExternalCheckinWorkbook } from "./external-checkin-sheet";
const fields: ExternalCheckinField[] = [{ key: "code", label: "编号", input: true, required: true, match: true }, { key: "company", label: "现场单位", input: true, required: true, match: false }];
it("maps only required verification columns; collected details may be absent from imported source", () => {
  assert.deepEqual(mapExternalCheckinSheet([["编号"], ["001"]], { code: "0", company: "" }, fields), [{ code: "001", company: "" }]);
  assert.throws(() => mapExternalCheckinSheet([["编号"], ["001"]], {}, fields), /编号/);
  assert.throws(() => mapExternalCheckinSheet([["编号"], ["001"]], { code: "0", company: "0" }, fields), /同一列/);
});
it("reads Excel and CSV identifiers as text, retaining leading zeros", async () => {
  const csv = new File(["编号,现场单位\n001,测试单位\n"], "名单.csv", { type: "text/csv" });
  const csvSheets = await readExternalCheckinWorkbook(csv);
  assert.deepEqual(csvSheets[0].rows[0], ["编号", "现场单位"]);
  assert.equal(csvSheets[0].rows[1][1], "测试单位");
  assert.equal(csvSheets[0].rows[1][0], "001");
  const xlsx = await import("xlsx"), book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([["编号"], ["00002"]]), "嘉宾");
  const file = new File([xlsx.write(book, { type: "array", bookType: "xlsx" })], "名单.xlsx");
  assert.equal((await readExternalCheckinWorkbook(file))[0].rows[1][0], "00002");
});
