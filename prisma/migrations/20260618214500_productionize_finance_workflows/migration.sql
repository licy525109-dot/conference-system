ALTER TABLE "refunds"
  ADD COLUMN "outRefundNo" TEXT,
  ADD COLUMN "failedReason" TEXT;

CREATE UNIQUE INDEX "refunds_outRefundNo_key" ON "refunds"("outRefundNo");

UPDATE "refunds"
SET "outRefundNo" = CONCAT('REG_REFUND_', "orderNo", '_', SUBSTRING("id", 1, 8))
WHERE "outRefundNo" IS NULL;

ALTER TABLE "invoice_applications"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'REGISTRATION',
  ADD COLUMN "invoiceType" TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "issuedInvoiceNo" TEXT,
  ADD COLUMN "invoiceLink" TEXT,
  ADD COLUMN "remark" TEXT;

CREATE INDEX "invoice_applications_sourceType_idx" ON "invoice_applications"("sourceType");
