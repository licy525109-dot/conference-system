ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'MEMBER_PRICE';

ALTER TABLE "membership_price_rules" ADD COLUMN "fixedPriceCent" INTEGER;
