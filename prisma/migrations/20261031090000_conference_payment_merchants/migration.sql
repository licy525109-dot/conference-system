ALTER TABLE "admin_users" ADD COLUMN "conferenceScopeMode" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "admin_users" ALTER COLUMN "conferenceScopeMode" SET DEFAULT 'ASSIGNED';
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_conferenceScopeMode_check" CHECK ("conferenceScopeMode" IN ('ALL', 'ASSIGNED'));

CREATE TABLE "admin_conference_grants" (
  "adminUserId" TEXT NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "conferenceId" TEXT NOT NULL REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("adminUserId", "conferenceId")
);
CREATE INDEX "admin_conference_grants_conferenceId_idx" ON "admin_conference_grants"("conferenceId");

CREATE TABLE "payment_merchants" (
  "id" TEXT PRIMARY KEY,
  "companyName" TEXT NOT NULL,
  "mchId" TEXT NOT NULL UNIQUE,
  "remark" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "activeRevisionId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "payment_merchant_revisions" (
  "id" TEXT PRIMARY KEY,
  "merchantId" TEXT NOT NULL REFERENCES "payment_merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "version" INTEGER NOT NULL,
  "appId" TEXT NOT NULL,
  "mchSerialNo" TEXT NOT NULL,
  "platformKeyId" TEXT NOT NULL,
  "credentialEnc" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3),
  "associationConfirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("merchantId", "version")
);
ALTER TABLE "payment_merchants" ADD CONSTRAINT "payment_merchants_activeRevisionId_fkey"
  FOREIGN KEY ("activeRevisionId") REFERENCES "payment_merchant_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conferences" ADD COLUMN "paymentMerchantId" TEXT REFERENCES "payment_merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "conferences_paymentMerchantId_idx" ON "conferences"("paymentMerchantId");
ALTER TABLE "orders" ADD COLUMN "paymentMerchantRevisionId" TEXT REFERENCES "payment_merchant_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD COLUMN "paymentMerchantSnapshot" JSONB;
CREATE INDEX "orders_paymentMerchantRevisionId_idx" ON "orders"("paymentMerchantRevisionId");
ALTER TABLE "wechat_bills" ADD COLUMN "merchantKey" TEXT NOT NULL DEFAULT 'DEFAULT';
DROP INDEX "wechat_bills_billDate_billType_key";
CREATE UNIQUE INDEX "wechat_bills_billDate_billType_merchantKey_key" ON "wechat_bills"("billDate", "billType", "merchantKey");
