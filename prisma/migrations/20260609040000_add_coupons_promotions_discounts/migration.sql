CREATE TYPE "DiscountType" AS ENUM ('FULL_REDUCTION', 'COUPON');
CREATE TYPE "CouponType" AS ENUM ('AMOUNT', 'PERCENT');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('PENDING', 'USED', 'CANCELLED');

ALTER TABLE "orders"
  ADD COLUMN "discountAmountCent" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "coupons" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CouponType" NOT NULL,
  "discountAmountCent" INTEGER,
  "discountPercent" INTEGER,
  "maxDiscountCent" INTEGER,
  "minAmountCent" INTEGER,
  "minQuantity" INTEGER,
  "totalLimit" INTEGER,
  "perUserLimit" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "stackableWithPromotion" BOOLEAN NOT NULL DEFAULT false,
  "conferenceId" TEXT,
  "allowedSkuIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_rules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "DiscountType" NOT NULL DEFAULT 'FULL_REDUCTION',
  "conferenceId" TEXT,
  "allowedSkuIds" JSONB,
  "minAmountCent" INTEGER,
  "minQuantity" INTEGER,
  "discountAmountCent" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "stackableWithCoupon" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_discounts" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" "DiscountType" NOT NULL,
  "title" TEXT NOT NULL,
  "amountCent" INTEGER NOT NULL,
  "couponId" TEXT,
  "promotionRuleId" TEXT,
  "snapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_discounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_redemptions" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "userId" TEXT,
  "orderId" TEXT NOT NULL,
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE INDEX "coupons_enabled_idx" ON "coupons"("enabled");
CREATE INDEX "coupons_conferenceId_idx" ON "coupons"("conferenceId");
CREATE INDEX "coupons_createdAt_idx" ON "coupons"("createdAt");
CREATE INDEX "promotion_rules_enabled_idx" ON "promotion_rules"("enabled");
CREATE INDEX "promotion_rules_conferenceId_idx" ON "promotion_rules"("conferenceId");
CREATE INDEX "promotion_rules_createdAt_idx" ON "promotion_rules"("createdAt");
CREATE INDEX "order_discounts_orderId_idx" ON "order_discounts"("orderId");
CREATE INDEX "order_discounts_couponId_idx" ON "order_discounts"("couponId");
CREATE INDEX "order_discounts_promotionRuleId_idx" ON "order_discounts"("promotionRuleId");
CREATE INDEX "order_discounts_createdAt_idx" ON "order_discounts"("createdAt");
CREATE INDEX "coupon_redemptions_couponId_idx" ON "coupon_redemptions"("couponId");
CREATE INDEX "coupon_redemptions_userId_idx" ON "coupon_redemptions"("userId");
CREATE INDEX "coupon_redemptions_orderId_idx" ON "coupon_redemptions"("orderId");
CREATE INDEX "coupon_redemptions_status_idx" ON "coupon_redemptions"("status");

ALTER TABLE "order_discounts"
  ADD CONSTRAINT "order_discounts_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotion_rules"
  ADD CONSTRAINT "promotion_rules_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_discounts"
  ADD CONSTRAINT "order_discounts_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_discounts"
  ADD CONSTRAINT "order_discounts_promotionRuleId_fkey"
  FOREIGN KEY ("promotionRuleId") REFERENCES "promotion_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
