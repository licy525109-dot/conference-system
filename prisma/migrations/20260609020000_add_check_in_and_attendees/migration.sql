CREATE TYPE "CheckInStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CHECKED_IN', 'CANCELLED');

ALTER TABLE "conferences"
  ADD COLUMN "checkInEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "registration_attendees" (
  "id" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "company" TEXT,
  "title" TEXT,
  "formDataJson" JSONB,
  "checkInStatus" "CheckInStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "checkedInAt" TIMESTAMP(3),
  "checkedInBy" TEXT,
  "adminRemark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "registration_attendees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registration_attendees_registrationId_idx" ON "registration_attendees"("registrationId");
CREATE INDEX "registration_attendees_skuId_idx" ON "registration_attendees"("skuId");
CREATE INDEX "registration_attendees_checkInStatus_idx" ON "registration_attendees"("checkInStatus");
CREATE INDEX "registration_attendees_createdAt_idx" ON "registration_attendees"("createdAt");

ALTER TABLE "registration_attendees"
  ADD CONSTRAINT "registration_attendees_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registration_attendees"
  ADD CONSTRAINT "registration_attendees_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "registration_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
