import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectRosterMapping,
  prepareRosterRows,
  mergeRosterRows,
} from "./invitation-roster";
import {
  applyInvitationPreset,
  createInvitationContent,
  invitationShare,
  matchInvitationInvitee,
  resolveInvitationText,
} from "@conference/shared";
import { updateInvitationShare } from "../invitation/wechat-share";

test("roster recognizes a title row, reordered aliases and imports only selected public columns", async () => {
  const sheet = {
    name: "公开名单",
    truncated: false,
    rows: [
      ["会议拟邀名单"],
      ["手机号", "职务", "机构名称", "嘉宾姓名"],
      ["13800000000", "院长", "甲机构", "张明"],
      ["", "主任", "乙机构", "张明"],
      ["", "院长", "甲机构", "张明"],
      ["", "职务", "无姓名机构", ""],
    ],
  };
  const mapping = detectRosterMapping(sheet.rows);
  assert.deepEqual(mapping, { header: 1, name: 3, organization: 2, role: 1 });
  const result = await prepareRosterRows(sheet, mapping, []);
  assert.equal(result.items.length, 2);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.issues, [{ row: 6, reason: "缺少姓名" }]);
  assert.ok(!JSON.stringify(result).includes("13800000000"));
  assert.notEqual(result.items[0].id, result.items[1].id);
});
test("reimport preserves roster IDs, updates role and supports explicit replacement", async () => {
  const existing = [
    { id: "saved-id", name: "张 明", organization: "甲机构", role: "原职务" },
  ];
  const sheet = {
    name: "名单",
    truncated: false,
    rows: [
      ["姓名", "单位", "职务"],
      ["张明", "甲机构", "新职务"],
      ["李明", "乙机构", "主任"],
    ],
  };
  const first = await prepareRosterRows(
    sheet,
    detectRosterMapping(sheet.rows),
    existing,
  );
  const second = await prepareRosterRows(
    sheet,
    detectRosterMapping(sheet.rows),
    [],
  );
  assert.equal(first.items[0].id, "saved-id");
  assert.equal(first.items[1].id, second.items[1].id);
  assert.equal(
    mergeRosterRows(existing, first.items, "merge")[0].role,
    "新职务",
  );
  assert.equal(
    mergeRosterRows(existing, [first.items[1]], "replace").length,
    1,
  );
});
test("conflicting rows cannot silently overwrite a same-name colleague", async () => {
  const sheet = {
    name: "名单",
    truncated: false,
    rows: [
      ["姓名", "单位", "职务"],
      ["张明", "甲", "院长"],
      ["张明", "甲", "主任"],
    ],
  };
  await assert.rejects(
    prepareRosterRows(sheet, detectRosterMapping(sheet.rows), []),
    /职务不同/,
  );
  await assert.rejects(
    prepareRosterRows(
      { ...sheet, rows: sheet.rows.slice(0, 2) },
      detectRosterMapping(sheet.rows),
      [
        { id: "a", name: "张明", organization: "甲" },
        { id: "b", name: "张明", organization: "甲" },
      ],
    ),
    /多条记录/,
  );
});
test("roster rejects missing mapping, repeated columns, truncated and oversized files without silent loss", async () => {
  const sheet = { name: "名单", truncated: false, rows: [["姓名"], ["张明"]] };
  await assert.rejects(
    prepareRosterRows(
      sheet,
      { header: 0, name: -1, organization: -1, role: -1 },
      [],
    ),
    /姓名列/,
  );
  await assert.rejects(
    prepareRosterRows(
      sheet,
      { header: 0, name: 0, organization: 0, role: -1 },
      [],
    ),
    /同一列/,
  );
  await assert.rejects(
    prepareRosterRows(
      { ...sheet, truncated: true },
      detectRosterMapping(sheet.rows),
      [],
    ),
    /读取范围/,
  );
  const large = {
    ...sheet,
    rows: [["姓名"], ...Array.from({ length: 501 }, (_, i) => [`嘉宾${i}`])],
  };
  await assert.rejects(
    prepareRosterRows(large, detectRosterMapping(large.rows), []),
    /500/,
  );
  assert.throws(
    () =>
      mergeRosterRows(
        Array.from({ length: 500 }, (_, i) => ({
          id: `${i}`,
          name: `${i}`,
          organization: "",
        })),
        [{ id: "extra", name: "额外", organization: "" }],
        "merge",
      ),
    /500/,
  );
});
test("duplicate names require explicit binding and removed bindings never fall back to another person", () => {
  const rows = [
    { id: "a", name: "张明", organization: "甲" },
    { id: "b", name: "张明", organization: "乙" },
  ];
  assert.equal(
    matchInvitationInvitee(rows, { name: "张 明", salutation: "" }).status,
    "ambiguous",
  );
  assert.equal(
    matchInvitationInvitee(rows, {
      name: "张明",
      salutation: "",
      publicInviteeId: "b",
    }).item?.organization,
    "乙",
  );
  assert.equal(
    matchInvitationInvitee([rows[0]], {
      name: "张明",
      salutation: "",
      publicInviteeId: "b",
    }).status,
    "missing",
  );
  assert.equal(
    matchInvitationInvitee([rows[0]], {
      name: "李明",
      salutation: "",
      publicInviteeId: "a",
    }).status,
    "missing",
  );
});
test("share variables are literal, one pass, personalized and used by both WeChat share APIs", () => {
  const recipient = { name: "张{会议名称}<老师>", salutation: "先生" };
  assert.equal(
    resolveInvitationText(
      "{姓名}{称谓} · {会议名称} {未知}",
      recipient,
      "观潮",
    ),
    "张{会议名称}<老师>先生 · 观潮 {未知}",
  );
  const document = {
    content: {
      ...createInvitationContent({ title: "观潮交流会" }),
      shareDescription: "诚邀{姓名}{称谓}赴约{会议名称}",
    },
    recipient: { name: "李明", salutation: "老师" },
    shareUrl: "https://guanchaohuiji.com/i/example",
  };
  const resolved = invitationShare(document);
  assert.equal(resolved.title, "李明专属邀请函");
  assert.equal(resolved.description, "诚邀李明老师赴约观潮交流会");
  const calls: Record<string, unknown>[] = [];
  updateInvitationShare(
    {
      updateAppMessageShareData: (data: Record<string, unknown>) =>
        calls.push(data),
      updateTimelineShareData: (data: Record<string, unknown>) =>
        calls.push(data),
    } as never,
    document as never,
  );
  assert.deepEqual(
    calls.map((call) => call.title),
    ["李明专属邀请函", "李明专属邀请函"],
  );
});
test("visual preset changes presentation without changing conference facts or roster", () => {
  const content = createInvitationContent({
    title: "真实会议",
    location: "真实会场",
  });
  content.invitees = [{ id: "a", name: "真实嘉宾", organization: "甲" }];
  const next = applyInvitationPreset(content, "jade");
  assert.equal(next.location, content.location);
  assert.equal(next.invitees, content.invitees);
  assert.equal(next.coverImageUrl, "/invitation-art/jade-paper.jpg");
  assert.equal(next.heroOverlayOpacity, 0);
});
