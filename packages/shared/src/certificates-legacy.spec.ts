import assert from "node:assert/strict";
import { test } from "node:test";
import { convertLegacyCertificates } from "./certificates-legacy";
test("legacy migration preserves all same-name rows, numbers, zero positions and displayed labels", () => {
  const result = convertLegacyCertificates({ students: [{ name: "同名", certificateNo: "001" }, { name: "同名", certificateNo: "002" }], settings: { fieldPositions: { name: { x: 0, y: 0 } }, displayFields: { organization: true }, fieldLabels: { organization: "所属单位" } } });
  assert.equal(result.rows.length, 2); assert.equal(result.rows[0].certificateNo, "001"); assert.equal(result.rows[1].certificateNo, "002"); assert.equal(result.config.templates[0].fields[0].x, 0); assert.equal(result.config.templates[0].fields[1].text, "所属单位："); assert.equal(result.report.duplicateNameGroups, 1);
});
