import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInvitationContent,
  createInvitationModule,
  invitationVisibleModules,
  invitationVenueItems,
  normalizeInvitationContent,
  normalizeInvitationFrame,
  normalizeInvitationOrganizationCanvas,
  normalizeInvitationModuleSettings,
  arrangeInvitationOrganizations,
} from "@conference/shared";
import {
  applyAgendaImport,
  detectAgendaMapping,
  prepareAgendaRows,
} from "./invitation-agenda";
const sheet = (rows: string[][]) => ({ name: "议程", rows, truncated: false });
test("agenda recognizes reordered headers and uses the selected date for blank dates", () => {
  const rows = [
    ["活动议程"],
    ["嘉宾", "议题", "时间", "日期"],
    ["示例嘉宾", "交流", "09:00", ""],
    ["", "圆桌", "下午", "DAY2"],
  ];
  const mapping = detectAgendaMapping(rows);
  assert.equal(mapping.header, 1);
  const result = prepareAgendaRows(sheet(rows), mapping, "DAY1");
  assert.equal(result.issues.length, 0);
  assert.deepEqual(
    result.rows.map((row) => [row.date, row.time, row.title, row.speaker]),
    [
      ["DAY1", "09:00", "交流", "示例嘉宾"],
      ["DAY2", "下午", "圆桌", ""],
    ],
  );
});
test("headerless agenda retains the first row and literal multiline titles", () => {
  const rows = [["上午", "交流\n第二行", "嘉宾"]];
  assert.equal(detectAgendaMapping(rows).header, -1);
  assert.equal(
    prepareAgendaRows(sheet(rows), detectAgendaMapping(rows), "DAY1").rows[0]
      .title,
    "交流\n第二行",
  );
});
test("agenda validation reports unsafe assets, missing titles and length without silent truncation", () => {
  const rows = [
    ["时间", "议题", "头像"],
    ["上午", "", ""],
    ["下午", "议题", "javascript:alert(1)"],
    ["a".repeat(51), "议题", ""],
    ["晚间", "合法议题", "https://example.com/a.jpg"],
  ];
  const result = prepareAgendaRows(
    sheet(rows),
    detectAgendaMapping(rows),
    "DAY1",
  );
  assert.deepEqual(
    result.issues.map((issue) => issue.row),
    [2, 3, 4],
  );
  assert.equal(result.rows.length, 1);
  assert.throws(() =>
    prepareAgendaRows(
      { ...sheet(rows), truncated: true },
      detectAgendaMapping(rows),
      "DAY1",
    ),
  );
  assert.throws(() =>
    prepareAgendaRows(
      sheet(rows),
      { ...detectAgendaMapping(rows), time: 1 },
      "DAY1",
    ),
  );
});
test("agenda limits all nonempty rows to 150", () => {
  const rows = Array.from({ length: 151 }, () => ["上午", "议题"]);
  assert.throws(
    () => prepareAgendaRows(sheet(rows), detectAgendaMapping(rows), "DAY1"),
    /150/,
  );
});
test("replacing a day retains the relative day order and untouched details", () => {
  const base = {
    id: "a",
    date: "DAY1",
    time: "上午",
    title: "旧议题",
    speaker: "嘉宾",
    location: "主会场",
    imageUrl: "https://example.com/avatar.png",
  };
  const other = { ...base, id: "b", date: "DAY2" };
  const incoming = { ...base, id: "c", title: "新议题" };
  assert.deepEqual(applyAgendaImport([base, other], [incoming], "DAY1", true), [
    incoming,
    other,
  ]);
  assert.deepEqual(applyAgendaImport([base, other], [incoming], "DAY1"), [
    base,
    other,
    incoming,
  ]);
});
test("custom venue entries do not fall back when empty and preserve legacy meeting fields", () => {
  const content = createInvitationContent();
  content.dateLabel = "原会议日期";
  const module = content.modules.find((module) => module.type === "venue")!;
  assert.equal(
    invitationVenueItems(content, module)[0].description,
    "原会议日期",
  );
  module.settings = {
    ...normalizeInvitationModuleSettings(module.settings),
    venueMode: "custom",
  };
  assert.equal(
    invitationVisibleModules(content).some((module) => module.type === "venue"),
    false,
  );
  module.items = [
    {
      id: "x",
      title: "签到",
      description: "上午\n接待台",
      imageUrl: "",
      href: "javascript:alert(1)",
      body: [],
      icon: "location",
    },
  ];
  const normalized = normalizeInvitationContent(content);
  assert.equal(normalized.dateLabel, "原会议日期");
  assert.equal(
    invitationVenueItems(
      normalized,
      normalized.modules.find((module) => module.type === "venue")!,
    )[0].href,
    "",
  );
});
test("canvas frames and label styles are bounded and round trip safely", () => {
  assert.deepEqual(
    normalizeInvitationFrame({ x: 500, y: -50, width: 30, height: 10 }),
    { x: 70, y: 0, width: 30, height: 10 },
  );
  const canvas = normalizeInvitationOrganizationCanvas({
    width: 0,
    height: 99999,
    labels: [
      { id: "same", text: "单位", color: "url(javascript:)", x: 500 },
      { id: "same", text: "另一单位" },
    ],
  });
  assert.equal(canvas.width, 320);
  assert.equal(canvas.height, 6000);
  assert.notEqual(canvas.labels[0].id, canvas.labels[1].id);
  assert.equal(canvas.labels[0].color, "#765925");
  assert.deepEqual(normalizeInvitationOrganizationCanvas(canvas), canvas);
});
test("organization auto arrangement keeps role groups, assets and metadata", () => {
  const module = createInvitationModule("organizations", "org");
  module.items = Array.from({ length: 8 }, (_, index) => ({
    id: `unit${index}`,
    title: index < 4 ? "主办单位" : "生态协同",
    description: `单位${index}`,
    href: "",
    imageUrl: "https://example.com/logo.png",
    body: [],
    icon: "link",
  }));
  const result = arrangeInvitationOrganizations(module);
  assert.deepEqual(
    result.organizationCanvas!.labels.map((label) => label.text),
    ["主办单位", "生态协同"],
  );
  assert.equal(result.items!.length, 8);
  for (const item of result.items!) {
    assert.equal(item.imageUrl, "https://example.com/logo.png");
    assert.ok(item.frame!.y + item.frame!.height <= 100);
  }
});
test("contacts normalize unsafe assets, hide empty rows and preserve configured module order", () => {
  const content = createInvitationContent();
  const module = createInvitationModule("contacts", "contact");
  content.modules = [module];
  assert.equal(invitationVisibleModules(content).length, 0);
  module.contacts = [
    {
      id: "a",
      name: "会务组",
      role: "接待",
      phone: "010-12345678",
      wechat: "conference",
      note: "联系备注\n第二行",
      imageUrl: "javascript:alert(1)",
    },
  ];
  const normalized = normalizeInvitationContent(content);
  assert.equal(normalized.modules[0].contacts![0].imageUrl, "");
  assert.equal(normalized.modules[0].contacts![0].note, "联系备注\n第二行");
  assert.equal(invitationVisibleModules(normalized)[0].type, "contacts");
  assert.deepEqual(normalizeInvitationContent(normalized), normalized);
  normalized.modules[0].enabled = false;
  assert.equal(invitationVisibleModules(normalized).length, 0);
});
