-- P7B-4 notification config, WeCom targeted sending metadata, and AI provider/PDF support.
-- This migration only adds enum values, columns, indexes, and a configuration table.

ALTER TYPE "CustomerGroupMessageStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "CustomerGroupMessageStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

CREATE TABLE IF NOT EXISTS "notification_channel_configs" (
  "id" TEXT NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT,
  "providerSource" TEXT NOT NULL DEFAULT 'DB',
  "signature" TEXT,
  "templateKey" TEXT,
  "smsTemplate" TEXT,
  "apiKeyEnc" TEXT,
  "apiSecretEnc" TEXT,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
  "retryMaxAttempts" INTEGER NOT NULL DEFAULT 0,
  "retryIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
  "settingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_channel_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_channel_configs_channel_key" ON "notification_channel_configs"("channel");
CREATE INDEX IF NOT EXISTS "notification_channel_configs_enabled_idx" ON "notification_channel_configs"("enabled");
CREATE INDEX IF NOT EXISTS "notification_channel_configs_providerSource_idx" ON "notification_channel_configs"("providerSource");

ALTER TABLE "customer_group_message_tasks"
  ADD COLUMN IF NOT EXISTS "targetScope" TEXT NOT NULL DEFAULT 'SELECTED_GROUPS',
  ADD COLUMN IF NOT EXISTS "wecomMsgId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalResultJson" JSONB,
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "providerSource" TEXT;

CREATE INDEX IF NOT EXISTS "customer_group_message_tasks_targetScope_idx" ON "customer_group_message_tasks"("targetScope");
CREATE INDEX IF NOT EXISTS "customer_group_message_tasks_wecomMsgId_idx" ON "customer_group_message_tasks"("wecomMsgId");

ALTER TABLE "customer_group_message_logs"
  ADD COLUMN IF NOT EXISTS "wecomGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;

CREATE INDEX IF NOT EXISTS "customer_group_message_logs_wecomGroupId_idx" ON "customer_group_message_logs"("wecomGroupId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_group_message_logs_wecomGroupId_fkey'
  ) THEN
    ALTER TABLE "customer_group_message_logs"
      ADD CONSTRAINT "customer_group_message_logs_wecomGroupId_fkey"
      FOREIGN KEY ("wecomGroupId") REFERENCES "wecom_customer_groups"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ai_configs"
  ADD COLUMN IF NOT EXISTS "baseUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "apiKeyEnc" TEXT;
