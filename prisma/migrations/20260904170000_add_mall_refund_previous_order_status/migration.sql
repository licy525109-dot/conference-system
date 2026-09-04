ALTER TABLE "mall_refunds"
ADD COLUMN "previousOrderStatus" TEXT;

UPDATE "mall_refunds" AS refund
SET "previousOrderStatus" = COALESCE(after_sale."previousOrderStatus", 'PAID')
FROM "mall_after_sales" AS after_sale
WHERE refund."afterSaleId" = after_sale."id"
  AND refund."previousOrderStatus" IS NULL;

UPDATE "mall_refunds"
SET "previousOrderStatus" = 'PAID'
WHERE "previousOrderStatus" IS NULL;
