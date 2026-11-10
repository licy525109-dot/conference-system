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
  it("shows every duplicate, source row and differing field without preselecting or writing", () => {
    const row = { name: "同名", code: "001", company: "甲", note: "" };
    const existing = [{ id: "stored", values: row, checkedInAt: "2026-11-11T01:00:00.000Z" }];
    const records = [row, { ...row, code: "002" }, { ...row, company: "乙" }, { code: "" }];
    const before = JSON.stringify({ existing, records });
    const result = planExternalCheckinImport(records, fields, existing, { rowNumbers: [12, 20, 43, 106] });
    assert.equal(result.added, 1); assert.equal(result.skipped, 1); assert.equal(result.deduplicated, 1); assert.equal(result.unresolved, 1);
    assert.deepEqual(result.errors, [{ row: 106, message: "请填写编号" }]);
    const group = result.duplicates[0];
    assert.deepEqual(group.matchValues, { code: "001" }); assert.deepEqual(group.differingFields, ["company"]);
    assert.equal(group.selectedCandidateId, null); assert.equal(group.resolved, false); assert.deepEqual(group.candidates.map(candidate => candidate.row), [null, 43]);
    assert.equal(group.candidates[0].checkedInAt, existing[0].checkedInAt); assert.equal(group.candidates[1].values.company, "乙");
    assert.equal(JSON.stringify({ existing, records }), before);
  });
  it("automatically deduplicates identical records and asks only for different records", () => {
    const row = { name: "同名", code: "001", company: "甲", note: "" };
    const identical = planExternalCheckinImport([row, row], fields, []);
    assert.equal(identical.added, 1); assert.equal(identical.skipped, 1); assert.equal(identical.deduplicated, 1); assert.equal(identical.unresolved, 0);
    assert.deepEqual(identical.duplicates, []);
    const records = [row, { ...row, company: "乙" }, { ...row, company: "丙" }, { ...row, code: "００１ " }];
    const selected = planExternalCheckinImport(records, fields, [], { decisions: [{ groupId: "duplicate:0", keepCandidateId: "incoming:2" }] });
    assert.equal(selected.unresolved, 0); assert.equal(selected.added, 1); assert.equal(selected.skipped, 3); assert.equal(selected.deduplicated, 1);
    assert.deepEqual(selected.additions, [records[2]]); assert.deepEqual(selected.updates, []);
  });
  it("keeps existing data or updates only the chosen roster fields", () => {
    const row = { name: "原姓名", code: "001", company: "甲", note: "备注" };
    const existing = [{ id: "stored", values: row, checkedInAt: "2026-11-11T01:00:00.000Z" }];
    const records = [{ ...row, name: "新姓名" }, { ...row, company: "乙" }];
    const kept = planExternalCheckinImport(records, fields, existing, { decisions: [{ groupId: "duplicate:0", keepCandidateId: "existing:stored" }] });
    assert.equal(kept.skipped, 2); assert.equal(kept.updated, 0); assert.equal(kept.added, 0); assert.equal(kept.unresolved, 0);
    const replaced = planExternalCheckinImport(records, fields, existing, { decisions: [{ groupId: "duplicate:0", keepCandidateId: "incoming:1" }] });
    assert.equal(replaced.updated, 1); assert.equal(replaced.skipped, 1); assert.equal(replaced.added, 0);
    assert.deepEqual(replaced.updates, [{ id: "stored", values: records[1] }]);
    const identical = planExternalCheckinImport([row], fields, existing);
    assert.equal(identical.skipped, 1); assert.equal(identical.updated, 0); assert.equal(identical.unresolved, 0); assert.deepEqual(identical.duplicates, []);
  });
  it("discards all incoming conflicts without deleting an existing attendee", () => {
    const row = { name: "原姓名", code: "001", company: "甲", note: "" }, changed = { ...row, company: "乙" };
    const decisions = [{ groupId: "duplicate:0", keepCandidateId: null }];
    for (const existing of [[], [{ id: "stored", values: row, checkedInAt: "2026-11-11T01:00:00.000Z" }]]) {
      const plan = planExternalCheckinImport([row, changed, changed], fields, existing, { decisions });
      assert.equal(plan.added, 0); assert.equal(plan.updated, 0); assert.equal(plan.skipped, 3); assert.equal(plan.unresolved, 0);
      assert.equal(plan.duplicates[0].resolved, true); assert.equal(plan.duplicates[0].selectedCandidateId, null);
      assert.deepEqual(plan.additions, []); assert.deepEqual(plan.updates, []);
    }
  });
  it("handles full batches with identical copies and many conflicting candidates", () => {
    const row = { name: "姓名", code: "001", company: "单位", note: "" };
    const identical = planExternalCheckinImport(Array(5000).fill(row), fields, []);
    assert.equal(identical.deduplicated, 4999); assert.equal(identical.added, 1);
    const different = planExternalCheckinImport(Array.from({ length: 5000 }, (_, i) => ({ ...row, note: String(i) })), fields, []);
    assert.equal(different.unresolved, 1); assert.equal(different.duplicates[0].candidates.length, 5000);
  });
  it("rejects forged, cross-group and repeated decisions and detects unresolved groups", () => {
    const row = { name: "甲", code: "001", company: "甲", note: "" }, other = { ...row, code: "002" };
    const records = [row, { ...row, company: "乙" }, other, { ...other, company: "乙" }];
    const decision = { groupId: "duplicate:0", keepCandidateId: "incoming:1" };
    assert.equal(planExternalCheckinImport(records, fields, [], { decisions: [decision] }).unresolved, 1);
    for (const decisions of [[decision, decision], [{ ...decision, keepCandidateId: "incoming:2" }], [{ ...decision, keepCandidateId: "existing:foreign" }], [{ ...decision, groupId: "duplicate:99" }], { groupId: "duplicate:0" }]) {
      assert.throws(() => planExternalCheckinImport(records, fields, [], { decisions }), /选择|保留/);
    }
    for (const rowNumbers of [[2], [2, 2], [3, 2], [0, 1], [2, 1.5]]) assert.throws(() => planExternalCheckinImport([row, row], fields, [], { rowNumbers }), /行号/);
    assert.throws(() => planExternalCheckinImport([], fields, []), /1–5000/);
    assert.throws(() => planExternalCheckinImport(Array(5001).fill(row), fields, []), /1–5000/);
  });
});
