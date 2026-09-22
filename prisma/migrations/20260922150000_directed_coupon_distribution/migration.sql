ALTER TABLE "coupons" ADD COLUMN "requiresClaim" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "coupon_claims" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "coupon_claims" ADD COLUMN "distributionId" TEXT;

CREATE TABLE "coupon_distributions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetPhone" TEXT,
    "tokenHash" TEXT,
    "tokenEncrypted" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdByAdminId" TEXT,
    "remark" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coupon_distributions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coupon_distributions_tokenHash_key" ON "coupon_distributions"("tokenHash");
CREATE UNIQUE INDEX "coupon_distributions_createdByAdminId_idempotencyKey_key" ON "coupon_distributions"("createdByAdminId", "idempotencyKey");
CREATE INDEX "coupon_distributions_couponId_createdAt_idx" ON "coupon_distributions"("couponId", "createdAt");
CREATE INDEX "coupon_distributions_targetUserId_idx" ON "coupon_distributions"("targetUserId");
CREATE INDEX "coupon_distributions_targetPhone_couponId_idx" ON "coupon_distributions"("targetPhone", "couponId");
CREATE INDEX "coupon_distributions_claimUserId_idx" ON "coupon_distributions"("claimUserId");
CREATE UNIQUE INDEX "coupon_claims_distributionId_key" ON "coupon_claims"("distributionId");
ALTER TABLE "coupon_distributions" ADD CONSTRAINT "coupon_distributions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_distributions" ADD CONSTRAINT "coupon_distributions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupon_distributions" ADD CONSTRAINT "coupon_distributions_claimUserId_fkey" FOREIGN KEY ("claimUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupon_distributions" ADD CONSTRAINT "coupon_distributions_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "coupon_distributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
