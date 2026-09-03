import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuestScheduleFields, formatTableNo } from "./guestSchedulePresentation";

describe("guest schedule presentation", () => {
  it("uses explicit dinner labels and formats a table number", () => {
    assert.deepEqual(buildGuestScheduleFields({
      type: "DINNER",
      location: "宴会厅",
      tableNo: "F",
      isTableLeader: true
    }), [
      { key: "location", label: "晚宴位置", value: "宴会厅", emphasis: false },
      { key: "tableNo", label: "所在桌号", value: "F 桌", emphasis: true },
      { key: "tableLeader", label: "桌长身份", value: "本桌桌长", emphasis: true }
    ]);
  });

  it("uses speech-specific labels and omits unconfigured values", () => {
    assert.deepEqual(buildGuestScheduleFields({
      type: "SPEECH",
      location: "主论坛 A 厅",
      role: "分享嘉宾",
      shareTopic: "行业协作的新机会",
      notes: null
    }), [
      { key: "location", label: "分享地点", value: "主论坛 A 厅", emphasis: false },
      { key: "role", label: "分享身份", value: "分享嘉宾", emphasis: false },
      { key: "shareTopic", label: "分享内容", value: "行业协作的新机会", emphasis: false }
    ]);
  });

  it("does not duplicate an existing table suffix", () => {
    assert.equal(formatTableNo("F桌"), "F桌");
    assert.equal(formatTableNo(" 主桌 "), "主桌");
  });
});
