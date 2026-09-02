import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WecomClientAdapter } from "../wecom/adapters/wecom-client.adapter";
import { WecomSmartBotAdapter, WecomSmartBotCredentials } from "../wecom/adapters/wecom-smart-bot.adapter";
import { WecomTokenService } from "../wecom/services/wecom-token.service";
import { encryptSecret } from "../wecom/wecom.crypto";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";
import { SMART_SHEET_TRANSPORT } from "./smart-sheet-webhook";
import { createDefaultWideSheetConfig } from "./smart-sheet-wide-config";

describe("GuestScheduleSyncService smart bot connection", () => {
  it("reuses an encrypted secret for discovery without returning it to the admin client", async () => {
    const plaintextSecret = "secret-that-must-never-be-returned";
    const existing = smartBotConnection(plaintextSecret);
    let receivedCredentials: WecomSmartBotCredentials | null = null;
    let receivedDocUrl = "";
    const prisma = {
      conference: { count: async () => 1 },
      wecomSmartSheetConnection: { findUnique: async () => existing }
    };
    const smartBot = {
      getSmartSheetSheets: async (credentials: WecomSmartBotCredentials, docUrl: string) => {
        receivedCredentials = credentials;
        receivedDocUrl = docUrl;
        return [{ sheet_id: "sheet-data", title: "数据汇总", type: "smartsheet" }];
      },
      getSmartSheetFields: async () => [
        { field_id: "field-name", field_title: "姓名", field_type: "text" },
        { field_id: "field-phone", field_title: "手机号", field_type: "text" }
      ]
    };
    const service = new GuestScheduleSyncService(
      prisma as unknown as PrismaService,
      {} as WecomClientAdapter,
      smartBot as unknown as WecomSmartBotAdapter,
      {} as WecomTokenService
    );
    const originalUrl = "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=share-code&tab=sheet-data";

    const result = await service.discover("conference-1", {
      transport: SMART_SHEET_TRANSPORT.SMART_BOT_API,
      smartBotId: "bot-id",
      docUrl: originalUrl
    });

    assert.deepEqual(receivedCredentials, { botId: "bot-id", secret: plaintextSecret });
    assert.equal(receivedDocUrl, originalUrl);
    assert.equal(result.data.transport, SMART_SHEET_TRANSPORT.SMART_BOT_API);
    assert.equal(result.data.docUrl.includes("scode=share-code"), true);
    assert.equal(JSON.stringify(result).includes(plaintextSecret), false);
  });

  it("returns only configured state for a stored bot secret", async () => {
    const plaintextSecret = "another-secret-that-must-stay-server-side";
    const connection = smartBotConnection(plaintextSecret);
    const prisma = {
      conference: { count: async () => 1 },
      wecomSmartSheetConnection: { findUnique: async () => connection },
      wecomIntegration: { findMany: async () => [] }
    };
    const service = new GuestScheduleSyncService(
      prisma as unknown as PrismaService,
      {} as WecomClientAdapter,
      {} as WecomSmartBotAdapter,
      {} as WecomTokenService
    );

    const result = await service.getConfig("conference-1");
    const serialized = JSON.stringify(result);

    assert.equal(result.data.connection?.smartBotSecretConfigured, true);
    assert.equal(result.data.connection?.smartBotSecretMasked, "已安全保存");
    assert.equal(serialized.includes(plaintextSecret), false);
    assert.equal(serialized.includes(String(connection.smartBotSecretEnc)), false);
  });
});

function smartBotConnection(secret: string) {
  return {
    id: "connection-1",
    conferenceId: "conference-1",
    integrationId: null,
    transport: SMART_SHEET_TRANSPORT.SMART_BOT_API,
    docId: "s3_existing",
    docUrl: "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=share-code&tab=sheet-data",
    guestSheetId: "sheet-data",
    assignmentSheetId: "sheet-data",
    webhookUrlEnc: null,
    webhookSchemaJson: null,
    automationTokenEnc: null,
    automationTokenHash: null,
    smartBotId: "bot-id",
    smartBotSecretEnc: encryptSecret(secret),
    guestFieldMappingJson: null,
    assignmentFieldMappingJson: createDefaultWideSheetConfig(["姓名", "手机号"]) as unknown as Prisma.JsonObject,
    enabled: false,
    syncIntervalSeconds: 60,
    syncLockedAt: null,
    lastGuestPushedAt: null,
    lastAssignmentPulledAt: null,
    lastAutomationReceivedAt: null,
    lastSyncAt: null,
    lastSyncStatus: "NEVER",
    lastError: null,
    createdAt: new Date("2026-09-03T00:00:00.000Z"),
    updatedAt: new Date("2026-09-03T00:00:00.000Z"),
    integration: null
  };
}
