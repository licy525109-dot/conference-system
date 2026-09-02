import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GuestScheduleType } from "@prisma/client";
import {
  createDefaultWideSheetConfig,
  normalizeWideSheetConfig,
  parseSmartSheetLink,
  SMART_SHEET_MODE
} from "./smart-sheet-wide-config";
import { wideAssignmentDraft } from "./guest-schedule-sync.service";

describe("existing SmartSheet wide-table config", () => {
  it("extracts document, sheet and view identifiers without persisting the share code", () => {
    const result = parseSmartSheetLink(
      "https://doc.weixin.qq.com/smartsheet/s3_example?scode=private-share-code&tab=data-sheet&viewId=guest-view"
    );

    assert.equal(result.docId, "s3_example");
    assert.equal(result.sheetId, "data-sheet");
    assert.equal(result.viewId, "guest-view");
    assert.equal(result.canonicalUrl.includes("scode"), false);
    assert.equal(result.canonicalUrl.includes("tab=data-sheet"), true);
  });

  it("suggests identity mappings from an existing guest data table", () => {
    const config = createDefaultWideSheetConfig(["姓名", "公司&品牌缩写", "手机号", "职位"]);

    assert.equal(config.mode, SMART_SHEET_MODE.EXISTING_WIDE_SHEET);
    assert.equal(config.identity.nameField, "姓名");
    assert.equal(config.identity.companyField, "公司&品牌缩写");
    assert.equal(config.identity.phoneField, "手机号");
    assert.equal(config.registration.titleField, "职位");
    assert.equal(config.writeRegistrationFields, false);
  });

  it("normalizes untrusted mapping input and keeps the existing-table mode", () => {
    const config = normalizeWideSheetConfig({
      mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
      identity: { nameField: " 姓名 ", phoneField: "手机号" },
      writeRegistrationFields: true,
      schedules: [{
        id: "workshop",
        type: GuestScheduleType.WORKSHOP,
        label: " 工作坊 ",
        enabled: true,
        startsAtField: "工作坊时间",
        activityNameFallback: "主题工作坊"
      }]
    });

    assert.equal(config.identity.nameField, "姓名");
    assert.equal(config.writeRegistrationFields, true);
    assert.equal(config.schedules[0]?.startsAtField, "工作坊时间");
    assert.equal(config.schedules[0]?.activityNameFallback, "主题工作坊");
  });

  it("expands one existing guest row into independent workshop and dinner drafts", () => {
    const workshopRule = normalizeWideSheetConfig({
      schedules: [{
        id: "workshop",
        type: GuestScheduleType.WORKSHOP,
        label: "工作坊",
        enabled: true,
        startsAtField: "工作坊时间",
        activityNameField: "工作坊名称",
        locationField: "工作坊地点"
      }]
    }).schedules[0]!;
    const dinnerRule = normalizeWideSheetConfig({
      schedules: [{
        id: "dinner",
        type: GuestScheduleType.DINNER,
        label: "晚宴",
        enabled: true,
        startsAtField: "晚宴时间",
        activityNameFallback: "欢迎晚宴",
        tableNoField: "桌号",
        isTableLeaderField: "是否桌长"
      }]
    }).schedules[0]!;
    const values = {
      工作坊名称: [{ type: "text", text: "品牌增长工作坊" }],
      工作坊时间: 46_540.5,
      工作坊地点: "3F A 厅",
      晚宴时间: "2027-06-07 18:30:00",
      桌号: "A08",
      是否桌长: true
    };

    const workshop = wideAssignmentDraft(values, workshopRule);
    const dinner = wideAssignmentDraft(values, dinnerRule);

    assert.equal(workshop.type, GuestScheduleType.WORKSHOP);
    assert.equal(workshop.name, "品牌增长工作坊");
    assert.equal(workshop.location, "3F A 厅");
    assert.equal(dinner.type, GuestScheduleType.DINNER);
    assert.equal(dinner.name, "欢迎晚宴");
    assert.equal(dinner.tableNo, "A08");
    assert.equal(dinner.isTableLeader, true);
    assert.equal(Number.isNaN(workshop.startsAt.getTime()), false);
  });
});
