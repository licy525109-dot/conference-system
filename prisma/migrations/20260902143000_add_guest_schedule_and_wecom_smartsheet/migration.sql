-- Guest on-site schedules and Enterprise WeChat SmartSheet synchronization.

CREATE TYPE "GuestScheduleType" AS ENUM ('WORKSHOP', 'DINNER', 'SPEECH', 'REHEARSAL', 'RECEPTION', 'OTHER');
CREATE TYPE "GuestScheduleSource" AS ENUM ('ADMIN', 'WECOM_SMART_SHEET');
CREATE TYPE "GuestScheduleSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILED', 'FAILED');

CREATE TABLE "wecom_smart_sheet_connections" (
  "id" TEXT NOT NULL,
  "conferenceId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "docUrl" TEXT,
  "guestSheetId" TEXT NOT NULL,
  "assignmentSheetId" TEXT NOT NULL,
  "guestFieldMappingJson" JSONB,
  "assignmentFieldMappingJson" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "syncIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
  "syncLockedAt" TIMESTAMP(3),
  "lastGuestPushedAt" TIMESTAMP(3),
  "lastAssignmentPulledAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT NOT NULL DEFAULT 'NEVER',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wecom_smart_sheet_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wecom_smart_sheet_guest_records" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "attendeeId" TEXT NOT NULL,
  "remoteRecordId" TEXT,
  "payloadHash" TEXT,
  "lastPushedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wecom_smart_sheet_guest_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_schedule_assignments" (
  "id" TEXT NOT NULL,
  "conferenceId" TEXT NOT NULL,
  "attendeeId" TEXT NOT NULL,
  "connectionId" TEXT,
  "type" "GuestScheduleType" NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "location" TEXT,
  "role" TEXT,
  "tableNo" TEXT,
  "isTableLeader" BOOLEAN NOT NULL DEFAULT false,
  "shareTopic" TEXT,
  "notes" TEXT,
  "source" "GuestScheduleSource" NOT NULL DEFAULT 'ADMIN',
  "remoteRecordId" TEXT,
  "remoteUpdatedAt" TIMESTAMP(3),
  "draftHash" TEXT NOT NULL,
  "hasUnpublishedChanges" BOOLEAN NOT NULL DEFAULT true,
  "publishedSnapshotJson" JSONB,
  "publishedHash" TEXT,
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "lastNotifiedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guest_schedule_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_schedule_sync_runs" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" "GuestScheduleSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "guestReadCount" INTEGER NOT NULL DEFAULT 0,
  "guestCreatedCount" INTEGER NOT NULL DEFAULT 0,
  "guestUpdatedCount" INTEGER NOT NULL DEFAULT 0,
  "assignmentReadCount" INTEGER NOT NULL DEFAULT 0,
  "assignmentCreatedCount" INTEGER NOT NULL DEFAULT 0,
  "assignmentUpdatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "detailsJson" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "guest_schedule_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wecom_smart_sheet_connections_conferenceId_key" ON "wecom_smart_sheet_connections"("conferenceId");
CREATE INDEX "wecom_smart_sheet_connections_integrationId_idx" ON "wecom_smart_sheet_connections"("integrationId");
CREATE INDEX "wecom_smart_sheet_connections_enabled_idx" ON "wecom_smart_sheet_connections"("enabled");
CREATE INDEX "wecom_smart_sheet_connections_lastSyncAt_idx" ON "wecom_smart_sheet_connections"("lastSyncAt");

CREATE UNIQUE INDEX "wecom_smart_sheet_guest_records_connectionId_attendeeId_key" ON "wecom_smart_sheet_guest_records"("connectionId", "attendeeId");
CREATE UNIQUE INDEX "wecom_smart_sheet_guest_records_connectionId_remoteRecordId_key" ON "wecom_smart_sheet_guest_records"("connectionId", "remoteRecordId");
CREATE INDEX "wecom_smart_sheet_guest_records_attendeeId_idx" ON "wecom_smart_sheet_guest_records"("attendeeId");
CREATE INDEX "wecom_smart_sheet_guest_records_lastPushedAt_idx" ON "wecom_smart_sheet_guest_records"("lastPushedAt");

CREATE UNIQUE INDEX "guest_schedule_assignments_connectionId_remoteRecordId_key" ON "guest_schedule_assignments"("connectionId", "remoteRecordId");
CREATE INDEX "guest_schedule_assignments_conferenceId_idx" ON "guest_schedule_assignments"("conferenceId");
CREATE INDEX "guest_schedule_assignments_attendeeId_idx" ON "guest_schedule_assignments"("attendeeId");
CREATE INDEX "guest_schedule_assignments_type_idx" ON "guest_schedule_assignments"("type");
CREATE INDEX "guest_schedule_assignments_startsAt_idx" ON "guest_schedule_assignments"("startsAt");
CREATE INDEX "guest_schedule_assignments_publishedAt_idx" ON "guest_schedule_assignments"("publishedAt");
CREATE INDEX "guest_schedule_assignments_archivedAt_idx" ON "guest_schedule_assignments"("archivedAt");

CREATE INDEX "guest_schedule_sync_runs_connectionId_idx" ON "guest_schedule_sync_runs"("connectionId");
CREATE INDEX "guest_schedule_sync_runs_status_idx" ON "guest_schedule_sync_runs"("status");
CREATE INDEX "guest_schedule_sync_runs_startedAt_idx" ON "guest_schedule_sync_runs"("startedAt");

ALTER TABLE "wecom_smart_sheet_connections"
  ADD CONSTRAINT "wecom_smart_sheet_connections_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "wecom_smart_sheet_connections_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "wecom_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wecom_smart_sheet_guest_records"
  ADD CONSTRAINT "wecom_smart_sheet_guest_records_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "wecom_smart_sheet_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "wecom_smart_sheet_guest_records_attendeeId_fkey"
  FOREIGN KEY ("attendeeId") REFERENCES "registration_attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_schedule_assignments"
  ADD CONSTRAINT "guest_schedule_assignments_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "guest_schedule_assignments_attendeeId_fkey"
  FOREIGN KEY ("attendeeId") REFERENCES "registration_attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "guest_schedule_assignments_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "wecom_smart_sheet_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "guest_schedule_assignments_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guest_schedule_sync_runs"
  ADD CONSTRAINT "guest_schedule_sync_runs_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "wecom_smart_sheet_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
