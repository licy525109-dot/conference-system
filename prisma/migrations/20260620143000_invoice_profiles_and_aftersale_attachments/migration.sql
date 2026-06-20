ALTER TABLE "mall_after_sales" ADD COLUMN "attachmentsJson" JSONB;
ALTER TABLE "invoice_applications" ADD COLUMN "address" TEXT;
ALTER TABLE "invoice_applications" ADD COLUMN "bankName" TEXT;
ALTER TABLE "invoice_applications" ADD COLUMN "bankAccount" TEXT;

CREATE TABLE "invoice_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "taxNo" TEXT,
  "invoiceType" TEXT NOT NULL DEFAULT 'GENERAL',
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "bankName" TEXT,
  "bankAccount" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_profiles_userId_idx" ON "invoice_profiles"("userId");
CREATE INDEX "invoice_profiles_isDefault_idx" ON "invoice_profiles"("isDefault");

ALTER TABLE "invoice_profiles" ADD CONSTRAINT "invoice_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
