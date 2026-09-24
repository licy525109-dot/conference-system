import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { WecomClientAdapter } from "../wecom/adapters/wecom-client.adapter";
import { WecomSmartBotAdapter } from "../wecom/adapters/wecom-smart-bot.adapter";
import { WecomTokenService } from "../wecom/services/wecom-token.service";
import { CurrentAdmin } from "../admin/current-admin";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";
import { createDefaultWideSheetConfig } from "./smart-sheet-wide-config";

function fixture(enabled = true) {
  const config = createDefaultWideSheetConfig(["系统参会人ID", "签到状态", "签到时间", "付款状态"]);
  config.statusWriteback.enabled = enabled;
  const connection = {
    id: "connection-test", conferenceId: "conference-test", enabled: true,
    transport: "SMART_BOT_API", docUrl: "https://doc.weixin.qq.com/smartsheet/s3_test?tab=sheet-test",
    guestSheetId: "sheet-test", assignmentSheetId: "sheet-test", assignmentFieldMappingJson: config,
    integration: null, conference: { id: "conference-test", title: "测试会议" }
  };
  const events: string[] = [];
  const runs: Array<Record<string, unknown>> = [];
  const attendees = [{
    id: "attendee-test", name: "测试嘉宾", phone: "13800000001", company: null,
    checkInStatus: "CANCELLED", checkedInAt: null,
    registration: {
      registrationNo: "REG-TEST", status: "REFUNDED", source: "PAYMENT",
      order: { orderNo: "ORDER-TEST", status: "REFUNDED", paidAmountCent: 100, payableAmountCent: 100, paidAt: null, refunds: [] }
    }
  }];
  const fields = ["系统参会人ID", "签到状态", "签到时间", "付款状态"].map((title) => ({ field_title: title, field_type: "FIELD_TYPE_TEXT" }));
  const prisma = {
    conference: { count: async () => 1 },
    wecomSmartSheetConnection: {
      findUnique: async () => connection,
      findMany: async (): Promise<Array<{ docId: string | null; docUrl: string | null; assignmentFieldMappingJson: unknown }>> => [],
      updateMany: async (args: { data: { syncLockedAt: Date | null } }) => { events.push(args.data.syncLockedAt ? "lock" : "unlock"); return { count: 1 }; },
      update: async () => undefined
    },
    guestScheduleSyncRun: {
      create: async (args: { data: Record<string, unknown> }) => { runs.push(args.data); return { id: "run-test" }; },
      update: async (args: { data: Record<string, unknown> }) => { runs.push(args.data); },
      findMany: async () => [{ id: "old-run", startedAt: new Date(), finishedAt: null, detailsJson: null }]
    },
    registrationAttendee: { findMany: async (args: { where: unknown; select: unknown }) => {
      events.push("load-statuses");
      assert.deepEqual(args.where, { registration: { conferenceId: "conference-test" } });
      assert.ok(JSON.stringify(args.select).includes("refunds"));
      return attendees;
    } },
    wecomSmartSheetGuestRecord: { findMany: async () => [{ attendeeId: "attendee-test", remoteRecordId: "row-test" }] },
    $transaction: async (promises: Promise<unknown>[]) => Promise.all(promises)
  };
  const session = {
    getFields: async () => fields,
    getRecords: async () => [{ record_id: "row-test", values: { 系统参会人ID: "attendee-test" } }],
    updateRecords: async (_sheetId: string, updates: Array<{ record_id: string; values: Record<string, unknown> }>) => {
      events.push("write-statuses");
      assert.equal(updates[0]?.record_id, "row-test");
      assert.deepEqual(updates[0]?.values["付款状态"], [{ type: "text", text: "已退款" }]);
    }
  };
  const service = new GuestScheduleSyncService(prisma as unknown as PrismaService, {} as WecomClientAdapter, {} as WecomSmartBotAdapter, {} as WecomTokenService);
  Object.assign(service, {
    createSmartSheetSession: async () => session,
    pushGuestRows: async () => { events.push("push-guests"); return { readCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, completed: true }; },
    pullAssignmentRows: async () => { events.push("pull-assignments"); return { readCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errors: [], completed: true }; }
  });
  return { service, prisma, session, config, connection, events, runs, fields };
}

describe("GuestScheduleSyncService status phase", () => {
  for (const trigger of ["MANUAL", "SCHEDULED"]) {
    it(`writes persisted refunded/canceled attendees for ${trigger} and stores diagnostics`, async () => {
      const f = fixture();
      const result = await f.service["syncConnection"]("connection-test", trigger, true);
      assert.equal(result.status, "SUCCESS");
      assert.ok("statusWriteback" in result);
      assert.ok(result.statusWriteback);
      assert.equal(result.statusWriteback.updatedCount, 1);
      assert.equal(f.runs[0]!.trigger, trigger);
      assert.ok(JSON.stringify(f.runs).includes('"statusWriteback"'));
      assert.equal(f.events.at(-1), "unlock");
    });
  }

  it("does not run the status phase for old/disabled settings", async () => {
    const f = fixture(false);
    const result = await f.service.syncNow("conference-test");
    assert.equal(result.data.status, "SUCCESS");
    assert.equal(f.events.includes("load-statuses"), false);
    assert.equal(f.events.includes("write-statuses"), false);
  });

  it("continues status writes when schedule import fails", async () => {
    const f = fixture();
    Object.assign(f.service, { pullAssignmentRows: async () => { throw new Error("事项时间无效"); } });
    const result = await f.service.syncNow("conference-test");
    assert.equal(result.data.status, "PARTIAL_FAILED");
    assert.ok(f.events.includes("write-statuses"));
  });

  it("records sanitized status failures without rejecting a finished sync and releases the lock", async () => {
    const f = fixture();
    f.session.updateRecords = async () => { throw new Error("gateway token=SECRET"); };
    const result = await f.service.syncNow("conference-test");
    assert.equal(result.data.status, "PARTIAL_FAILED");
    assert.ok("statusWriteback" in result.data);
    assert.ok(result.data.statusWriteback);
    assert.equal(result.data.statusWriteback.errorCount, 1);
    assert.equal(JSON.stringify(f.runs).includes("SECRET"), false);
    assert.equal(f.events.at(-1), "unlock");
  });

  it("preflights target column types before guest or status writes", async () => {
    const f = fixture();
    f.fields[1]!.field_type = "FIELD_TYPE_FORMULA";
    await assert.rejects(f.service.syncNow("conference-test"), /只支持文本列/);
    assert.equal(f.events.includes("push-guests"), false);
    assert.equal(f.events.includes("write-statuses"), false);
    assert.equal(f.events.at(-1), "unlock");
  });

  it("rejects two conferences writing to the same sheet even if share URLs differ", async () => {
    const f = fixture();
    f.prisma.wecomSmartSheetConnection.findMany = async () => [{
      docId: null, docUrl: "https://doc.weixin.qq.com/smartsheet/s3_test?scode=another&tab=sheet-test",
      assignmentFieldMappingJson: f.config
    }];
    await assert.rejects(f.service.syncNow("conference-test"), /多个会议/);
    assert.equal(f.events.includes("push-guests"), false);
    assert.equal(f.events.includes("write-statuses"), false);
  });

  it("rejects status writeback over webhook during save", async () => {
    const f = fixture();
    await assert.rejects(f.service.saveConfig("conference-test", {
      transport: "WEBHOOK_AUTOMATION", wideSheetConfig: f.config
    }, { id: "admin-test" } as CurrentAdmin), /状态回写需要/);
  });

  it("checks status-only configurations without writing any rows", async () => {
    const f = fixture();
    const result = await f.service.check("conference-test");
    assert.equal(result.data.ready, true);
    assert.equal(f.events.includes("write-statuses"), false);
    assert.equal(f.events.includes("push-guests"), false);
  });

  it("reads old sync history without a details object", async () => {
    const f = fixture();
    const result = await f.service.listRuns("conference-test", {});
    assert.equal(result.data.items[0]!.statusWriteback, null);
  });
});
