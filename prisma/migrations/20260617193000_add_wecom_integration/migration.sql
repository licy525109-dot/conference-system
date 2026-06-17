CREATE TABLE "wecom_integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "corpId" TEXT,
    "agentId" TEXT,
    "customerContactSecretEnc" TEXT,
    "appSecretEnc" TEXT,
    "callbackTokenEnc" TEXT,
    "callbackEncodingAesKeyEnc" TEXT,
    "customerContactCallbackUrl" TEXT,
    "appCallbackUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "lastTokenCheckedAt" TIMESTAMP(3),
    "lastGroupSyncedAt" TIMESTAMP(3),
    "lastCallbackAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wecom_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wecom_access_token_caches" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wecom_access_token_caches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wecom_customer_groups" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "conferenceId" TEXT,
    "chatId" TEXT,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerName" TEXT,
    "groupQrUrl" TEXT,
    "joinLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "syncStatus" TEXT NOT NULL DEFAULT 'MANUAL',
    "lastSyncedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wecom_customer_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wecom_callback_events" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "eventSource" TEXT NOT NULL,
    "eventType" TEXT,
    "changeType" TEXT,
    "fromUserName" TEXT,
    "externalUserId" TEXT,
    "chatId" TEXT,
    "rawPayload" JSONB,
    "decryptedXml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wecom_callback_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wecom_integrations_name_key" ON "wecom_integrations"("name");
CREATE INDEX "wecom_integrations_enabled_idx" ON "wecom_integrations"("enabled");
CREATE INDEX "wecom_integrations_updatedAt_idx" ON "wecom_integrations"("updatedAt");

CREATE UNIQUE INDEX "wecom_access_token_caches_integrationId_tokenType_key" ON "wecom_access_token_caches"("integrationId", "tokenType");
CREATE INDEX "wecom_access_token_caches_expiresAt_idx" ON "wecom_access_token_caches"("expiresAt");

CREATE UNIQUE INDEX "wecom_customer_groups_chatId_key" ON "wecom_customer_groups"("chatId");
CREATE INDEX "wecom_customer_groups_integrationId_idx" ON "wecom_customer_groups"("integrationId");
CREATE INDEX "wecom_customer_groups_conferenceId_idx" ON "wecom_customer_groups"("conferenceId");
CREATE INDEX "wecom_customer_groups_ownerUserId_idx" ON "wecom_customer_groups"("ownerUserId");
CREATE INDEX "wecom_customer_groups_status_idx" ON "wecom_customer_groups"("status");
CREATE INDEX "wecom_customer_groups_syncStatus_idx" ON "wecom_customer_groups"("syncStatus");
CREATE INDEX "wecom_customer_groups_lastSyncedAt_idx" ON "wecom_customer_groups"("lastSyncedAt");

CREATE INDEX "wecom_callback_events_integrationId_idx" ON "wecom_callback_events"("integrationId");
CREATE INDEX "wecom_callback_events_eventSource_idx" ON "wecom_callback_events"("eventSource");
CREATE INDEX "wecom_callback_events_eventType_idx" ON "wecom_callback_events"("eventType");
CREATE INDEX "wecom_callback_events_changeType_idx" ON "wecom_callback_events"("changeType");
CREATE INDEX "wecom_callback_events_chatId_idx" ON "wecom_callback_events"("chatId");
CREATE INDEX "wecom_callback_events_createdAt_idx" ON "wecom_callback_events"("createdAt");

ALTER TABLE "wecom_access_token_caches" ADD CONSTRAINT "wecom_access_token_caches_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "wecom_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wecom_customer_groups" ADD CONSTRAINT "wecom_customer_groups_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "wecom_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wecom_customer_groups" ADD CONSTRAINT "wecom_customer_groups_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wecom_callback_events" ADD CONSTRAINT "wecom_callback_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "wecom_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
