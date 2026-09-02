ALTER TABLE "wecom_smart_sheet_connections"
  DROP CONSTRAINT "wecom_smart_sheet_connections_integrationId_fkey";

ALTER TABLE "wecom_smart_sheet_connections"
  ALTER COLUMN "integrationId" DROP NOT NULL,
  ALTER COLUMN "docId" DROP NOT NULL,
  ALTER COLUMN "guestSheetId" DROP NOT NULL,
  ALTER COLUMN "assignmentSheetId" DROP NOT NULL,
  ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'API',
  ADD COLUMN "webhookUrlEnc" TEXT,
  ADD COLUMN "webhookSchemaJson" JSONB,
  ADD COLUMN "automationTokenEnc" TEXT,
  ADD COLUMN "automationTokenHash" TEXT,
  ADD COLUMN "lastAutomationReceivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "wecom_smart_sheet_connections_automationTokenHash_key"
  ON "wecom_smart_sheet_connections"("automationTokenHash");

ALTER TABLE "wecom_smart_sheet_connections"
  ADD CONSTRAINT "wecom_smart_sheet_connections_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "wecom_integrations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
