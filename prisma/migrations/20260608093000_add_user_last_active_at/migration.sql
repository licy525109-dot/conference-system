ALTER TABLE "users"
  ADD COLUMN "lastActiveAt" TIMESTAMP(3);

CREATE INDEX "users_lastActiveAt_idx" ON "users"("lastActiveAt");
