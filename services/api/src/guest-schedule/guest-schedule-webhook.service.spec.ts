import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GuestScheduleSource, GuestScheduleSyncStatus, GuestScheduleType } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WecomClientAdapter } from "../wecom/adapters/wecom-client.adapter";
import { WecomTokenService } from "../wecom/services/wecom-token.service";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";
import { SMART_SHEET_TRANSPORT } from "./smart-sheet-webhook";
import { SMART_SHEET_MODE } from "./smart-sheet-wide-config";

describe("GuestScheduleSyncService webhook callback", () => {
  it("keeps repeated callbacks idempotent and leaves the assignment unpublished", async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const connection = {
      id: "connection-1",
      conferenceId: "conference-1",
      integrationId: null,
      transport: SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION,
      docId: null,
      docUrl: "https://doc.weixin.qq.com/smartsheet/s3_example",
      guestSheetId: null,
      assignmentSheetId: null,
      webhookUrlEnc: null,
      webhookSchemaJson: {
        version: 1,
        schema: { fName: "姓名", fPhone: "手机号", fJoin: "参加工作坊", fWorkshop: "工作坊名称", fTime: "工作坊时间" },
        sampleValues: {}
      },
      automationTokenEnc: null,
      automationTokenHash: "hash",
      guestFieldMappingJson: null,
      assignmentFieldMappingJson: {
        mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
        identity: { attendeeIdField: "", phoneField: "手机号", nameField: "姓名", companyField: "" },
        writeRegistrationFields: false,
        registration: {},
        schedules: [{
          id: "workshop",
          type: GuestScheduleType.WORKSHOP,
          label: "工作坊",
          enabled: true,
          triggerField: "参加工作坊",
          activityNameField: "工作坊名称",
          startsAtField: "工作坊时间"
        }]
      },
      enabled: true,
      syncIntervalSeconds: 60,
      syncLockedAt: null,
      lastGuestPushedAt: null,
      lastAssignmentPulledAt: null,
      lastAutomationReceivedAt: null,
      lastSyncAt: null,
      lastSyncStatus: "NEVER",
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      integration: null,
      conference: { id: "conference-1", title: "测试会议" }
    };
    const prisma = {
      wecomSmartSheetConnection: {
        findUnique: async () => connection,
        updateMany: async () => ({ count: 1 }),
        update: async () => connection
      },
      guestScheduleSyncRun: {
        create: async () => ({ id: `run-${Date.now()}` }),
        update: async ({ data }: { data: Record<string, unknown> }) => data
      },
      registrationAttendee: {
        findMany: async () => [{ id: "attendee-1", name: "张三", phone: "13900000000", company: "观潮会集" }]
      },
      guestScheduleAssignment: {
        findUnique: async ({ where }: { where: { connectionId_remoteRecordId: { remoteRecordId: string } } }) =>
          assignments.find((item) => item.remoteRecordId === where.connectionId_remoteRecordId.remoteRecordId) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: "assignment-1",
            publishedHash: null,
            publishedAt: null,
            archivedAt: null,
            ...data
          };
          assignments.push(created);
          return created;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...assignments[0], ...data })
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
    };
    const service = new GuestScheduleSyncService(
      prisma as unknown as PrismaService,
      {} as WecomClientAdapter,
      {} as WecomTokenService
    );
    const payload = {
      record_id: "remote-row-1",
      update_time: 1_788_336_000_000,
      values: {
        fName: "张三",
        fPhone: "13900000000",
        fJoin: "是",
        fWorkshop: "品牌增长工作坊",
        fTime: "2026-09-02 16:00:00"
      }
    };

    const first = await service.receiveAutomation("a".repeat(40), payload);
    const second = await service.receiveAutomation("a".repeat(40), payload);

    assert.equal(first.created_count, 1);
    assert.equal(second.created_count, 0);
    assert.equal(second.skipped_count, 1);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0]?.source, GuestScheduleSource.WECOM_SMART_SHEET);
    assert.equal(assignments[0]?.hasUnpublishedChanges, true);
    assert.equal(assignments[0]?.publishedAt, null);
    assert.equal(assignments[0]?.remoteRecordId, "remote-row-1:workshop");
    assert.equal(GuestScheduleSyncStatus.SUCCESS, "SUCCESS");
  });
});
