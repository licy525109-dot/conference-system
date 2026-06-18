-- Add page binding, product material references, product type, and mall fulfillment snapshots.
-- Existing rows keep the current physical shipment behavior.

ALTER TABLE "page_templates"
  ADD COLUMN "bindingType" TEXT,
  ADD COLUMN "conferenceId" TEXT,
  ADD COLUMN "productId" TEXT;

CREATE INDEX "page_templates_bindingType_idx" ON "page_templates"("bindingType");
CREATE INDEX "page_templates_conferenceId_idx" ON "page_templates"("conferenceId");
CREATE INDEX "page_templates_productId_idx" ON "page_templates"("productId");

ALTER TABLE "products"
  ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'PHYSICAL',
  ADD COLUMN "coverMaterialId" TEXT;

CREATE INDEX "products_productType_idx" ON "products"("productType");
CREATE INDEX "products_coverMaterialId_idx" ON "products"("coverMaterialId");

ALTER TABLE "product_images"
  ADD COLUMN "materialId" TEXT;

CREATE INDEX "product_images_materialId_idx" ON "product_images"("materialId");

ALTER TABLE "mall_orders"
  ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'SHIPMENT';

CREATE INDEX "mall_orders_fulfillmentType_idx" ON "mall_orders"("fulfillmentType");

ALTER TABLE "mall_order_items"
  ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'PHYSICAL';

CREATE INDEX "mall_order_items_productType_idx" ON "mall_order_items"("productType");
