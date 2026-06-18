ALTER TYPE "CheckinActionType" ADD VALUE IF NOT EXISTS 'SELF_INPUT';
ALTER TYPE "CheckinActionType" ADD VALUE IF NOT EXISTS 'QR_SCAN';
ALTER TYPE "CheckinActionType" ADD VALUE IF NOT EXISTS 'ADMIN_MANUAL';

ALTER TABLE "conferences"
  ADD COLUMN "checkInStartsAt" TIMESTAMP(3),
  ADD COLUMN "checkInEndsAt" TIMESTAMP(3),
  ADD COLUMN "checkInMethods" JSONB,
  ADD COLUMN "checkInFieldBindings" JSONB;

ALTER TABLE "checkin_logs"
  ADD COLUMN "method" TEXT,
  ADD COLUMN "result" TEXT,
  ADD COLUMN "operatorUserId" TEXT,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "matchedFields" JSONB;

CREATE INDEX "checkin_logs_method_idx" ON "checkin_logs"("method");
CREATE INDEX "checkin_logs_result_idx" ON "checkin_logs"("result");
CREATE INDEX "checkin_logs_operatorUserId_idx" ON "checkin_logs"("operatorUserId");
