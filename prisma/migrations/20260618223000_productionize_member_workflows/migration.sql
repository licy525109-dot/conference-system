ALTER TABLE "member_levels"
  ADD COLUMN "defaultDays" INTEGER,
  ADD COLUMN "pricingEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "member_benefits"
  ADD COLUMN "iconUrl" TEXT,
  ADD COLUMN "autoGrant" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "grantRule" TEXT;

ALTER TABLE "user_memberships"
  ADD COLUMN "renewedAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "disabledReason" TEXT;

CREATE TABLE "member_benefit_grants" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT,
  "benefitId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GRANTED',
  "source" TEXT NOT NULL DEFAULT 'AUTO_GRANT',
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "remark" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "member_benefit_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_benefit_grants_userId_benefitId_membershipId_key" ON "member_benefit_grants"("userId", "benefitId", "membershipId");
CREATE INDEX "member_benefit_grants_userId_idx" ON "member_benefit_grants"("userId");
CREATE INDEX "member_benefit_grants_membershipId_idx" ON "member_benefit_grants"("membershipId");
CREATE INDEX "member_benefit_grants_benefitId_idx" ON "member_benefit_grants"("benefitId");
CREATE INDEX "member_benefit_grants_status_idx" ON "member_benefit_grants"("status");
CREATE INDEX "member_benefit_grants_expiredAt_idx" ON "member_benefit_grants"("expiredAt");

ALTER TABLE "member_benefit_grants" ADD CONSTRAINT "member_benefit_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_benefit_grants" ADD CONSTRAINT "member_benefit_grants_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "user_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_benefit_grants" ADD CONSTRAINT "member_benefit_grants_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "member_benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
