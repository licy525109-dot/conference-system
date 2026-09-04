ALTER TABLE "registration_skus"
  ADD COLUMN "lockedStock" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "orders"
  ADD COLUMN "inventoryReservedAt" TIMESTAMP(3);

ALTER TABLE "mall_orders"
  ADD COLUMN "expiredAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);

-- Preserve every outstanding registration commitment created before locked
-- inventory existed. The lifecycle worker can release expired rows after the
-- new API starts, while a late verified payment can consume the reservation.
WITH "pendingInventory" AS (
  SELECT "items"."skuId", SUM("items"."quantity")::INTEGER AS "quantity"
  FROM "order_items" AS "items"
  INNER JOIN "orders" AS "orders" ON "orders"."id" = "items"."orderId"
  WHERE "orders"."status" = 'PENDING'
  GROUP BY "items"."skuId"
)
UPDATE "registration_skus" AS "skus"
SET "lockedStock" = "pendingInventory"."quantity"
FROM "pendingInventory"
WHERE "skus"."id" = "pendingInventory"."skuId";

UPDATE "orders"
SET "inventoryReservedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "status" = 'PENDING';

-- Legacy mall orders already reserved product stock but had no expiry marker.
-- Give them the same 15-minute window used by newly-created mall orders.
UPDATE "mall_orders"
SET "expiredAt" = "createdAt" + INTERVAL '15 minutes'
WHERE "status" = 'PENDING_PAYMENT' AND "expiredAt" IS NULL;

CREATE INDEX "orders_status_expiredAt_idx" ON "orders"("status", "expiredAt");
CREATE INDEX "mall_orders_status_expiredAt_idx" ON "mall_orders"("status", "expiredAt");
