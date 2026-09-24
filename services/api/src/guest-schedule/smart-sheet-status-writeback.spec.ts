import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WecomSmartSheetRecord } from "../wecom/adapters/wecom-client.adapter";
import { createDefaultWideSheetConfig, normalizeWideSheetConfig, STATUS_WRITEBACK_LABELS } from "./smart-sheet-wide-config";
import { attendeeStatusValues, StatusAttendee, validateStatusWriteback, writeSmartSheetStatuses } from "./smart-sheet-status-writeback";

export function statusFixture() {
  const titles = ["系统参会人ID", "姓名", "手机号", ...Object.values(STATUS_WRITEBACK_LABELS)];
  const config = createDefaultWideSheetConfig(titles);
  config.statusWriteback.enabled = true;
  const attendee: StatusAttendee = {
    id: "attendee-1", name: "测试嘉宾", phone: "13800000001", company: "测试机构",
    checkInStatus: "CHECKED_IN", checkedInAt: new Date("2026-10-20T01:30:00Z"),
    registration: {
      registrationNo: "REG-TEST-1", status: "CONFIRMED", source: "PAYMENT",
      order: {
        orderNo: "ORDER-TEST-1", status: "PAID", paidAmountCent: 318000, payableAmountCent: 318000,
        paidAt: new Date("2026-09-23T01:00:00Z"), refunds: []
      }
    }
  };
  const records: WecomSmartSheetRecord[] = [{
    record_id: "row-1", values: { 系统参会人ID: "attendee-1", 姓名: "测试嘉宾", 手机号: "13800000001", 桌号: "F" }
  }];
  const writes: Array<Array<{ record_id: string; values: Record<string, unknown> }>> = [];
  return {
    config, fields: titles.map((title) => ({ title, type: "FIELD_TYPE_TEXT" })), attendees: [attendee], records,
    bindings: [{ attendeeId: attendee.id, remoteRecordId: "row-1" }], writes,
    updateRecords: async (updates: Array<{ record_id: string; values: Record<string, unknown> }>) => {
      writes.push(updates);
      updates.forEach((update) => Object.assign(records.find((row) => row.record_id === update.record_id)!.values!, update.values));
    }
  };
}

describe("SmartSheet authoritative status writeback", () => {
  it("defaults legacy configurations to disabled and strips unapproved source fields", () => {
    const config = normalizeWideSheetConfig({ statusWriteback: { enabled: "true", fields: { paymentStatus: " 付款状态 ", amount: "金额" } } });
    assert.equal(config.statusWriteback.enabled, false);
    assert.equal(config.statusWriteback.fields.paymentStatus, "付款状态");
    assert.equal("amount" in config.statusWriteback.fields, false);
    assert.equal(normalizeWideSheetConfig({}).statusWriteback.enabled, false);
  });

  it("does not write when disabled", async () => {
    const f = statusFixture();
    f.config.statusWriteback.enabled = false;
    const result = await writeSmartSheetStatuses(f);
    assert.equal(result.enabled, false);
    assert.equal(f.writes.length, 0);
  });

  it("updates only mapped cells on the bound row and is idempotent", async () => {
    const f = statusFixture();
    const first = await writeSmartSheetStatuses(f);
    assert.equal(first.updatedCount, 1);
    assert.deepEqual(f.writes[0]?.[0]?.values["签到状态"], [{ type: "text", text: "已签到" }]);
    assert.deepEqual(f.writes[0]?.[0]?.values["签到时间"], [{ type: "text", text: "2026-10-20 09:30:00" }]);
    assert.equal(f.records[0]!.values!["桌号"], "F");
    assert.equal("姓名" in f.writes[0]![0]!.values, false);
    const second = await writeSmartSheetStatuses(f);
    assert.equal(second.updatedCount, 0);
    assert.equal(second.unchangedCount, 1);
    assert.equal(f.writes.length, 1);
  });

  it("clears stale check-in time after revocation", async () => {
    const f = statusFixture();
    await writeSmartSheetStatuses(f);
    f.attendees[0]!.checkInStatus = "PENDING";
    f.attendees[0]!.checkedInAt = null;
    await writeSmartSheetStatuses(f);
    assert.deepEqual(f.writes[1]![0]!.values, {
      签到状态: [{ type: "text", text: "未签到" }], 签到时间: [{ type: "text", text: "" }]
    });
  });

  it("writes refunded and canceled registrations, never inventing a paid state from the sheet", async () => {
    const f = statusFixture();
    f.attendees[0]!.registration.status = "REFUNDED";
    f.attendees[0]!.registration.order.status = "REFUNDED";
    f.attendees[0]!.checkInStatus = "CANCELLED";
    f.records[0]!.values!["付款状态"] = "已支付";
    const result = await writeSmartSheetStatuses(f);
    assert.equal(result.updatedCount, 1);
    assert.deepEqual(f.writes[0]![0]!.values["退款状态"], [{ type: "text", text: "已全额退款" }]);
    assert.deepEqual(f.writes[0]![0]!.values["系统报名状态"], [{ type: "text", text: "已退款" }]);
    f.attendees[0]!.registration.status = "CANCELLED";
    assert.equal(attendeeStatusValues(f.attendees[0]!).registrationStatus, "已取消");
  });

  it("distinguishes partial refunds, pending requests and complimentary/free registrations", () => {
    const attendee = statusFixture().attendees[0]!;
    const order = attendee.registration.order;
    order.refunds = [{ status: "SUCCESS", amountCent: 10000, createdAt: new Date() }];
    assert.equal(attendeeStatusValues(attendee).refundStatus, "已部分退款");
    assert.equal(attendeeStatusValues(attendee).paymentStatus, "已支付");
    order.refunds.push({ status: "PROCESSING", amountCent: 10000, createdAt: new Date() });
    assert.equal(attendeeStatusValues(attendee).refundStatus, "已部分退款，退款处理中");
    order.refunds = [{ status: "REQUESTED", amountCent: 10000, createdAt: new Date() }];
    assert.equal(attendeeStatusValues(attendee).refundStatus, "退款申请中");
    order.refunds = [{ status: "FAILED", amountCent: 10000, createdAt: new Date() }];
    assert.equal(attendeeStatusValues(attendee).refundStatus, "退款失败");
    order.refunds = [];
    attendee.registration.source = "ADMIN_COMPLIMENTARY";
    assert.equal(attendeeStatusValues(attendee).paymentStatus, "主办方邀请（免付费）");
    assert.equal(attendeeStatusValues(attendee).paidAt, "");
    attendee.registration.source = "PAYMENT";
    order.payableAmountCent = 0;
    order.paidAmountCent = 0;
    assert.equal(attendeeStatusValues(attendee).paymentStatus, "无需支付");
  });

  it("keeps each attendee's check-in independent when one order/phone pays for several", async () => {
    const f = statusFixture();
    f.attendees.push({ ...f.attendees[0]!, id: "attendee-2", checkInStatus: "PENDING", checkedInAt: null });
    f.records.push({ record_id: "row-2", values: { 系统参会人ID: "attendee-2" } });
    f.bindings.push({ attendeeId: "attendee-2", remoteRecordId: "row-2" });
    const result = await writeSmartSheetStatuses(f);
    assert.equal(result.updatedCount, 2);
    assert.deepEqual(f.records[1]!.values!["签到状态"], [{ type: "text", text: "未签到" }]);
    assert.deepEqual(f.records[0]!.values!["系统订单号"], f.records[1]!.values!["系统订单号"]);
  });

  for (const scenario of ["conflicting-id", "duplicate-local-phone", "duplicate-remote-phone", "missing-row", "unbound", "duplicate-binding", "duplicate-remote-id", "different-name"] as const) {
    it(`fails closed for ${scenario}`, async () => {
      const f = statusFixture();
      if (scenario === "conflicting-id") f.records[0]!.values!["系统参会人ID"] = "other-guest";
      if (scenario.includes("phone") || scenario === "different-name") f.records[0]!.values!["系统参会人ID"] = "";
      if (scenario === "duplicate-local-phone") f.attendees.push({ ...f.attendees[0]!, id: "other-guest" });
      if (scenario === "duplicate-remote-phone") f.records.push({ ...f.records[0]!, record_id: "row-other" });
      if (scenario === "missing-row") f.records.length = 0;
      if (scenario === "unbound") f.bindings.length = 0;
      if (scenario === "duplicate-binding") f.bindings.push({ attendeeId: "other-guest", remoteRecordId: "row-1" });
      if (scenario === "duplicate-remote-id") f.records.push({ ...f.records[0]!, record_id: "row-other" });
      if (scenario === "different-name") f.records[0]!.values!["姓名"] = "其他嘉宾";
      const result = await writeSmartSheetStatuses(f);
      assert.ok(result.skippedCount > 0);
      assert.ok(result.errorCount > 0);
      assert.equal(f.writes.length, 0);
    });
  }

  it("supports unique phone fallback without a system ID", async () => {
    const f = statusFixture();
    f.config.identity.attendeeIdField = "";
    f.records[0]!.values!["手机号"] = "+86 13800000001";
    assert.equal((await writeSmartSheetStatuses(f)).updatedCount, 1);
  });

  it("rejects conflicting mappings and unsupported columns before any write", async () => {
    for (const kind of ["duplicate", "identity", "schedule", "registration", "missing", "formula", "unknown", "no-fields"]) {
      const f = statusFixture();
      if (kind === "duplicate") f.config.statusWriteback.fields.checkedInAt = "签到状态";
      if (kind === "identity") f.config.statusWriteback.fields.checkInStatus = "姓名";
      if (kind === "schedule") {
        f.config.schedules[0]!.enabled = true;
        f.config.schedules[0]!.notesField = "签到状态";
      }
      if (kind === "registration") {
        f.config.writeRegistrationFields = true;
        f.config.registration.registrationStatusField = "系统报名状态";
      }
      if (kind === "missing") f.fields = f.fields.filter((field) => field.title !== "签到状态");
      if (kind === "formula" || kind === "unknown") f.fields.find((field) => field.title === "签到状态")!.type = kind;
      if (kind === "no-fields") Object.keys(f.config.statusWriteback.fields).forEach((key) => { f.config.statusWriteback.fields[key as keyof typeof f.config.statusWriteback.fields] = ""; });
      assert.ok(validateStatusWriteback(f.config, f.fields).length > 0, kind);
      assert.ok((await writeSmartSheetStatuses(f)).errorCount > 0, kind);
      assert.equal(f.writes.length, 0, kind);
    }
  });

  it("sanitizes gateway failures and retries latest state on the next run", async () => {
    const f = statusFixture();
    const result = await writeSmartSheetStatuses({ ...f, updateRecords: async () => { throw new Error("SECRET https://doc.example/?token=private guest-phone"); } });
    assert.equal(result.errorCount, 1);
    assert.equal(result.updatedCount, 0);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
    assert.equal(JSON.stringify(result).includes("guest-phone"), false);
    assert.equal((await writeSmartSheetStatuses(f)).updatedCount, 1);
  });

  it("does not resend unchanged values after a successful remote write with a lost acknowledgement", async () => {
    const f = statusFixture();
    const failed = await writeSmartSheetStatuses({ ...f, updateRecords: async (updates) => {
      await f.updateRecords(updates);
      throw new Error("response timed out");
    } });
    assert.equal(failed.errorCount, 1);
    const retried = await writeSmartSheetStatuses(f);
    assert.equal(retried.errorCount, 0);
    assert.equal(retried.unchangedCount, 1);
    assert.equal(f.writes.length, 1);
  });
});
