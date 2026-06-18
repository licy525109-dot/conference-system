ALTER TABLE "membership_price_rules"
  ADD COLUMN "discountType" TEXT,
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "membership_price_rules"
SET "discountType" = CASE
  WHEN "fixedPriceCent" IS NOT NULL THEN 'FIXED_PRICE'
  WHEN "discountPercent" IS NOT NULL THEN 'DISCOUNT'
  WHEN "discountCent" IS NOT NULL THEN 'REDUCE'
  ELSE 'FIXED_PRICE'
END
WHERE "discountType" IS NULL;

ALTER TABLE "membership_price_rules"
  ALTER COLUMN "discountType" SET NOT NULL,
  ALTER COLUMN "discountType" SET DEFAULT 'FIXED_PRICE';

CREATE INDEX "membership_price_rules_deletedAt_idx" ON "membership_price_rules"("deletedAt");
CREATE INDEX "membership_price_rules_disabledAt_idx" ON "membership_price_rules"("disabledAt");
