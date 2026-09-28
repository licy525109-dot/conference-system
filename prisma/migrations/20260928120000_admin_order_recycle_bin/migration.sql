ALTER TABLE "orders"
  ADD COLUMN "adminDeletedAt" TIMESTAMP(3),
  ADD COLUMN "adminDeletedBy" TEXT,
  ADD COLUMN "adminDeleteReason" TEXT;

CREATE INDEX "orders_adminDeletedAt_createdAt_idx" ON "orders"("adminDeletedAt", "createdAt");
