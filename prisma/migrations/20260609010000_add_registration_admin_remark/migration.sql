ALTER TABLE "registrations"
  ADD COLUMN "adminRemark" TEXT,
  ADD COLUMN "remarkUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "remarkUpdatedBy" TEXT;
