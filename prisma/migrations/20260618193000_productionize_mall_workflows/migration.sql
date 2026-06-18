ALTER TABLE "product_skus"
  ADD COLUMN "lockedStock" INTEGER NOT NULL DEFAULT 0;

UPDATE "mall_orders"
SET "status" = 'PENDING_PAYMENT'
WHERE "status" = 'PENDING';

ALTER TABLE "mall_orders"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

ALTER TABLE "mall_shipments"
  ADD COLUMN "pickupCode" TEXT,
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "mall_after_sales"
  ADD COLUMN "note" TEXT,
  ADD COLUMN "handledAt" TIMESTAMP(3);

UPDATE "mall_after_sales"
SET "status" = 'REQUESTED'
WHERE "status" = 'PENDING';

ALTER TABLE "mall_after_sales"
  ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

CREATE TABLE "mall_inventory_logs" (
  "id" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "orderId" TEXT,
  "action" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "beforeLockedStock" INTEGER NOT NULL,
  "afterLockedStock" INTEGER NOT NULL,
  "beforeSoldCount" INTEGER NOT NULL,
  "afterSoldCount" INTEGER NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mall_inventory_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mall_inventory_logs_skuId_idx" ON "mall_inventory_logs"("skuId");
CREATE INDEX "mall_inventory_logs_orderId_idx" ON "mall_inventory_logs"("orderId");
CREATE INDEX "mall_inventory_logs_action_idx" ON "mall_inventory_logs"("action");
CREATE INDEX "mall_inventory_logs_createdAt_idx" ON "mall_inventory_logs"("createdAt");

ALTER TABLE "mall_inventory_logs"
  ADD CONSTRAINT "mall_inventory_logs_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mall_inventory_logs"
  ADD CONSTRAINT "mall_inventory_logs_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
