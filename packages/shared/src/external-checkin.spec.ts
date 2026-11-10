import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { externalCheckinIdentity, parseExternalCheckinFields, parseExternalCheckinValues, planExternalCheckinImport, type ExternalCheckinField } from "./external-checkin";
const fields: ExternalCheckinField[] = [
  { key: "name", label: "姓名", input: true, required: true, match: false },
  { key: "code", label: "编号", input: true, required: true, match: true },
  { key: "company", label: "单位", input: true, required: false, match: false },
  { key: "note", label: "内部备注", input: false, required: false, match: false }
];
describe("external check-in configurable inputs and identity", () => {
  it("matches only the selected verification fields and retains additional input separately", () => {
    const roster = { name: "导入姓名", code: "001", company: "原单位", note: "内部备注" };
    const submitted = parseExternalCheckinValues({ name: "填写姓名", code: "００１ ", company: "现场单位", note: "不得提交" }, fields, true);
    assert.equal(externalCheckinIdentity(submitted, fields), externalCheckinIdentity(roster, fields));
    assert.deepEqual(submitted, { name: "填写姓名", code: "001", company: "现场单位" });
    assert.throws(() => parseExternalCheckinValues({ code: "001" }, fields, true), /姓名/);
    assert.equal(parseExternalCheckinValues({ code: "001" }, fields).name, "", "required collection fields need not exist in imported source");
  });
  it("preserves zeros, letter case and internal whitespace to avoid fuzzy false positives", () => {
    assert.notEqual(externalCheckinIdentity({ code: "001" }, fields), externalCheckinIdentity({ code: "1" }, fields));
    assert.notEqual(externalCheckinIdentity({ code: "AB" }, fields), externalCheckinIdentity({ code: "ab" }, fields));
    assert.notEqual(externalCheckinIdentity({ code: "A B" }, fields), externalCheckinIdentity({ code: "AB" }, fields));
    assert.throws(() => parseExternalCheckinValues({ code: 1 }, fields), /文本/);
  });
  it("requires explicit verification and rejects hidden or optional verification fields", () => {
    assert.deepEqual(parseExternalCheckinFields(fields), fields);
    assert.throws(() => parseExternalCheckinFields(fields.map(f => ({ ...f, match: false }))), /核验/);
    for (const change of [{ input: false }, { required: false }]) assert.throws(() => parseExternalCheckinFields(fields.map(f => f.match ? { ...f, ...change } : f)), /核验/);
    assert.throws(() => parseExternalCheckinFields([...fields, fields[0]]), /重复/);
    assert.throws(() => parseExternalCheckinFields([{ ...fields[1], key: "constructor" }]), /标识/);
  });
  it("previews duplicates and conflicting identities without silently merging people", () => {
    const row = { name: "同名", code: "001", company: "甲", note: "" };
    const result = planExternalCheckinImport([row, { ...row, code: "002" }, { ...row, company: "乙" }, { code: "" }], fields, [row]);
    assert.equal(result.added, 1); assert.equal(result.skipped, 1); assert.equal(result.errors.length, 2);
    assert.equal(result.errors[0].row, 4);
    assert.equal(planExternalCheckinImport([row, row], fields, []).skipped, 1);
    assert.throws(() => planExternalCheckinImport([], fields, []), /1–5000/);
    assert.throws(() => planExternalCheckinImport(Array(5001).fill(row), fields, []), /1–5000/);
  });
});
