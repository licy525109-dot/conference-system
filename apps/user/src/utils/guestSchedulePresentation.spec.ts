import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuestScheduleFields, formatGuestScheduleNotificationTitle, formatGuestScheduleTime, formatTableNo } from "./guestSchedulePresentation";

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

  it("omits table-leader status unless explicitly true, even with an assigned table", () => {
    for (const isTableLeader of [false, undefined]) {
      assert.deepEqual(buildGuestScheduleFields({ type: "DINNER", tableNo: "F", isTableLeader }), [
        { key: "tableNo", label: "所在桌号", value: "F 桌", emphasis: true }
      ]);
    }
    assert.deepEqual(buildGuestScheduleFields({ type: "DINNER", isTableLeader: true }), [
      { key: "tableLeader", label: "桌长身份", value: "本桌桌长", emphasis: true }
    ]);
  });
});

describe("guest schedule notification titles", () => {
  const base = { type: "GUEST_SCHEDULE_PUBLISHED", title: "会议名称及会务安排已更新" };

  it("uses the sole schedule name without altering the original title", () => {
    const item = { ...base, payloadJson: { items: [{ name: " 晚宴安排 " }] } };
    assert.equal(formatGuestScheduleNotificationTitle(item), "晚宴安排");
    assert.equal(item.title, base.title);
  });

  it("uses a concise update title for multiple or missing schedules", () => {
    assert.equal(formatGuestScheduleNotificationTitle({ ...base, payloadJson: { items: [{ name: "晚宴安排" }, { name: "分享安排" }] } }), "会务安排更新");
    assert.equal(formatGuestScheduleNotificationTitle(base), "会务安排更新");
    assert.equal(formatGuestScheduleNotificationTitle({ ...base, payloadJson: { items: [{ name: " " }] } }), "会务安排更新");
  });

  it("leaves every unrelated notification title unchanged", () => {
    for (const type of ["REGISTRATION_CONFIRMED", "PAYMENT_SUCCESS", "REFUND_STATUS_UPDATED", "OTHER"]) {
      assert.equal(formatGuestScheduleNotificationTitle({ ...base, type, payloadJson: { items: [{ name: "晚宴安排" }] } }), base.title);
    }
  });
});

describe("guest schedule time presentation", () => {
  it("formats local dates, weekdays and zero-padded times without repeating a same-day date", () => {
    assert.deepEqual(formatGuestScheduleTime("2026-10-22T09:05:00", "2026-10-22T21:00:00"), {
      date: "10月22日", weekday: "周四", time: "09:05", end: "21:00"
    });
  });

  it("includes the end date across days and handles midnight", () => {
    assert.deepEqual(formatGuestScheduleTime("2026-10-22T23:59:00", "2026-10-23T00:05:00"), {
      date: "10月22日", weekday: "周四", time: "23:59", end: "10月23日 00:05"
    });
  });

  it("includes both years when a schedule crosses the year boundary", () => {
    assert.deepEqual(formatGuestScheduleTime("2026-12-31T23:59:00", "2027-01-01T00:05:00"), {
      date: "2026年12月31日", weekday: "周四", time: "23:59", end: "2027年1月1日 00:05"
    });
  });

  it("handles leap-day transitions and Sunday labels", () => {
    assert.equal(formatGuestScheduleTime("2028-02-29T23:00:00", "2028-03-01T01:00:00").end, "3月1日 01:00");
    assert.equal(formatGuestScheduleTime("2026-10-25T09:00:00").weekday, "周日");
  });

  it("keeps an absent end empty and never invents invalid or missing dates", () => {
    assert.equal(formatGuestScheduleTime("2026-10-22T09:00:00", null).end, "");
    assert.equal(formatGuestScheduleTime("2026-10-22T09:00:00", "invalid").end, "");
    assert.deepEqual(formatGuestScheduleTime(undefined, "invalid"), { date: "", weekday: "", time: "", end: "" });
    assert.deepEqual(formatGuestScheduleTime("invalid", "2026-10-22T21:00:00"), {
      date: "", weekday: "", time: "", end: "10月22日 21:00"
    });
  });

  it("works when Intl is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Intl")!;
    try {
      Object.defineProperty(globalThis, "Intl", { configurable: true, value: undefined });
      assert.deepEqual(formatGuestScheduleTime("2026-12-31T23:59:00", "2027-01-01T00:05:00"), {
        date: "2026年12月31日", weekday: "周四", time: "23:59", end: "2027年1月1日 00:05"
      });
    } finally {
      Object.defineProperty(globalThis, "Intl", descriptor);
    }
  });
});
