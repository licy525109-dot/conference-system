CREATE TABLE "checkin_staff_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conferenceId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "permissions" JSONB,
  "remark" TEXT,
  "createdBy" TEXT,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkin_staff_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checkin_staff_assignments_userId_idx" ON "checkin_staff_assignments"("userId");
CREATE INDEX "checkin_staff_assignments_conferenceId_idx" ON "checkin_staff_assignments"("conferenceId");
CREATE INDEX "checkin_staff_assignments_enabled_idx" ON "checkin_staff_assignments"("enabled");
CREATE INDEX "checkin_staff_assignments_createdAt_idx" ON "checkin_staff_assignments"("createdAt");

ALTER TABLE "checkin_staff_assignments"
  ADD CONSTRAINT "checkin_staff_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkin_staff_assignments"
  ADD CONSTRAINT "checkin_staff_assignments_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
