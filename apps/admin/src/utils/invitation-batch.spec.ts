import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareInvitationBatch, invitationBatchCsv } from "./invitation-batch";
const mapping = { start: 1, name: 0, organization: 1, salutation: 2 };
test("batch preview keeps only invitation fields, detects duplicates and matches by organization", () => {
  const sheet = {
    name: "名单",
    truncated: false,
    rows: [
      ["姓名", "单位", "称谓", "手机号"],
      ["同名", "甲机构", "老师", "13800000000"],
      ["同名", "乙机构", "先生", "13900000000"],
      ["同名", "甲机构", "老师", "13800000000"],
      ["", "丙机构", "", ""],
    ],
  };
  const { rows, duplicates } = prepareInvitationBatch(
    sheet,
    mapping,
    [
      { id: "a", name: "同名", organization: "甲机构" },
      { id: "b", name: "同名", organization: "乙机构" },
    ],
    "女士",
  );
  assert.equal(duplicates, 1);
  assert.equal(rows[0].publicInviteeId, "a");
  assert.equal(rows[1].publicInviteeId, "b");
  assert.equal(rows[2].issue, "缺少姓名");
  assert.doesNotMatch(JSON.stringify(rows), /13800000000|13900000000/);
});
test("batch preview accepts headerless names and never guesses an ambiguous identity", () => {
  const sheet = {
    name: "粘贴",
    truncated: false,
    rows: [["同名"], ["新嘉宾"]],
  };
  const { rows } = prepareInvitationBatch(
    sheet,
    { start: 0, name: 0, organization: -1, salutation: -1 },
    [
      { id: "a", name: "同名", organization: "甲" },
      { id: "b", name: "同名", organization: "乙" },
    ],
    "老师",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].publicInviteeId, "");
  assert.equal(rows[0].candidates.length, 2);
  assert.equal(rows[1].salutation, "老师");
});
test("batch preview rejects truncation, reused columns and oversized batches", () => {
  const sheet = {
    name: "名单",
    truncated: false,
    rows: Array.from({ length: 201 }, (_, i) => [`嘉宾${i}`]),
  };
  assert.throws(
    () =>
      prepareInvitationBatch(
        sheet,
        { ...mapping, start: 0, salutation: -1, organization: -1 },
        [],
        "老师",
      ),
    /200/,
  );
  assert.throws(
    () =>
      prepareInvitationBatch(
        { ...sheet, truncated: true },
        mapping,
        [],
        "老师",
      ),
    /读取范围/,
  );
  assert.throws(
    () =>
      prepareInvitationBatch(sheet, { ...mapping, salutation: 0 }, [], "老师"),
    /同一列/,
  );
});
test("exported invitation CSV escapes quotes and prevents spreadsheet formula injection", () => {
  const csv = invitationBatchCsv([
    {
      name: '=HYPERLINK("evil")',
      salutation: "+老师",
      shareUrl: "https://guanchaohuiji.com/i/example",
    },
  ]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.match(csv, /"'=HYPERLINK\(""evil""\)"/);
  assert.match(csv, /"'\+老师"/);
  assert.match(csv, /guanchaohuiji\.com/);
});
