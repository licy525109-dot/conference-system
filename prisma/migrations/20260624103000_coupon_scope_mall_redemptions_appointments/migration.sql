-- Add coupon business scope, mall coupon redemptions, and conference appointments.
CREATE TYPE "CouponScope" AS ENUM ('CONFERENCE', 'MALL', 'BOTH');

ALTER TABLE "coupons"
  ADD COLUMN "scope" "CouponScope" NOT NULL DEFAULT 'CONFERENCE';

ALTER TABLE "mall_orders"
  ADD COLUMN "couponId" TEXT,
  ADD COLUMN "couponCode" TEXT;

CREATE TABLE "mall_coupon_redemptions" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "userId" TEXT,
  "mallOrderId" TEXT NOT NULL,
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mall_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conference_appointments" (
  "id" TEXT NOT NULL,
  "conferenceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "source" TEXT NOT NULL DEFAULT 'USER',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conference_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coupons_scope_idx" ON "coupons"("scope");
CREATE INDEX "mall_orders_couponId_idx" ON "mall_orders"("couponId");
CREATE INDEX "mall_coupon_redemptions_couponId_idx" ON "mall_coupon_redemptions"("couponId");
CREATE INDEX "mall_coupon_redemptions_userId_idx" ON "mall_coupon_redemptions"("userId");
CREATE INDEX "mall_coupon_redemptions_mallOrderId_idx" ON "mall_coupon_redemptions"("mallOrderId");
CREATE INDEX "mall_coupon_redemptions_status_idx" ON "mall_coupon_redemptions"("status");
CREATE UNIQUE INDEX "conference_appointments_conferenceId_userId_key" ON "conference_appointments"("conferenceId", "userId");
CREATE INDEX "conference_appointments_conferenceId_idx" ON "conference_appointments"("conferenceId");
CREATE INDEX "conference_appointments_userId_idx" ON "conference_appointments"("userId");
CREATE INDEX "conference_appointments_status_idx" ON "conference_appointments"("status");
CREATE INDEX "conference_appointments_createdAt_idx" ON "conference_appointments"("createdAt");

ALTER TABLE "mall_orders"
  ADD CONSTRAINT "mall_orders_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mall_coupon_redemptions"
  ADD CONSTRAINT "mall_coupon_redemptions_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mall_coupon_redemptions"
  ADD CONSTRAINT "mall_coupon_redemptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mall_coupon_redemptions"
  ADD CONSTRAINT "mall_coupon_redemptions_mallOrderId_fkey"
  FOREIGN KEY ("mallOrderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conference_appointments"
  ADD CONSTRAINT "conference_appointments_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conference_appointments"
  ADD CONSTRAINT "conference_appointments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
