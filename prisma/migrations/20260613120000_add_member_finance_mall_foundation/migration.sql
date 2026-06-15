CREATE TABLE "member_levels" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "priceCent" INTEGER NOT NULL DEFAULT 0,
  "discountPercent" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "benefitsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "member_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_benefits" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "configJson" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "member_benefits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_memberships" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "source" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "userId" TEXT,
  "levelId" TEXT NOT NULL,
  "amountCent" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "snapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_price_rules" (
  "id" TEXT NOT NULL,
  "levelId" TEXT NOT NULL,
  "conferenceId" TEXT,
  "skuId" TEXT,
  "discountPercent" INTEGER,
  "discountCent" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "membership_price_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_reconciliation_batches" (
  "id" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "source" TEXT NOT NULL DEFAULT 'LOCAL',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "summaryJson" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_reconciliation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_reconciliation_items" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "orderNo" TEXT,
  "outTradeNo" TEXT,
  "transactionId" TEXT,
  "localAmountCent" INTEGER,
  "remoteAmountCent" INTEGER,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "detailJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_reconciliation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wechat_bill_imports" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UPLOADED',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "errorJson" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wechat_bill_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_records" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT,
  "amountCent" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_records" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT,
  "title" TEXT NOT NULL,
  "amountCent" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "descriptionJson" JSONB,
  "coverImageUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_skus" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceCent" INTEGER NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "soldCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "specsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_images" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mall_orders" (
  "id" TEXT NOT NULL,
  "orderNo" TEXT NOT NULL,
  "userId" TEXT,
  "originAmountCent" INTEGER NOT NULL,
  "discountAmountCent" INTEGER NOT NULL DEFAULT 0,
  "payableAmountCent" INTEGER NOT NULL,
  "paidAmountCent" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "receiverName" TEXT,
  "receiverPhone" TEXT,
  "receiverAddress" TEXT,
  "remark" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mall_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mall_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "skuName" TEXT NOT NULL,
  "unitPriceCent" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "totalAmountCent" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mall_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mall_shipments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "company" TEXT,
  "trackingNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "shippedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mall_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mall_after_sales" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mall_after_sales_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_levels_code_key" ON "member_levels"("code");
CREATE INDEX "member_levels_enabled_idx" ON "member_levels"("enabled");
CREATE INDEX "member_levels_rank_idx" ON "member_levels"("rank");
CREATE INDEX "member_benefits_levelId_idx" ON "member_benefits"("levelId");
CREATE INDEX "member_benefits_enabled_idx" ON "member_benefits"("enabled");
CREATE INDEX "member_benefits_sortOrder_idx" ON "member_benefits"("sortOrder");
CREATE INDEX "user_memberships_userId_idx" ON "user_memberships"("userId");
CREATE INDEX "user_memberships_levelId_idx" ON "user_memberships"("levelId");
CREATE INDEX "user_memberships_status_idx" ON "user_memberships"("status");
CREATE INDEX "user_memberships_endsAt_idx" ON "user_memberships"("endsAt");
CREATE UNIQUE INDEX "membership_orders_orderNo_key" ON "membership_orders"("orderNo");
CREATE INDEX "membership_orders_userId_idx" ON "membership_orders"("userId");
CREATE INDEX "membership_orders_levelId_idx" ON "membership_orders"("levelId");
CREATE INDEX "membership_orders_status_idx" ON "membership_orders"("status");
CREATE INDEX "membership_orders_createdAt_idx" ON "membership_orders"("createdAt");
CREATE INDEX "membership_price_rules_levelId_idx" ON "membership_price_rules"("levelId");
CREATE INDEX "membership_price_rules_conferenceId_idx" ON "membership_price_rules"("conferenceId");
CREATE INDEX "membership_price_rules_skuId_idx" ON "membership_price_rules"("skuId");
CREATE INDEX "membership_price_rules_enabled_idx" ON "membership_price_rules"("enabled");

CREATE UNIQUE INDEX "finance_reconciliation_batches_batchNo_key" ON "finance_reconciliation_batches"("batchNo");
CREATE INDEX "finance_reconciliation_batches_status_idx" ON "finance_reconciliation_batches"("status");
CREATE INDEX "finance_reconciliation_batches_createdAt_idx" ON "finance_reconciliation_batches"("createdAt");
CREATE INDEX "finance_reconciliation_items_batchId_idx" ON "finance_reconciliation_items"("batchId");
CREATE INDEX "finance_reconciliation_items_type_idx" ON "finance_reconciliation_items"("type");
CREATE INDEX "finance_reconciliation_items_status_idx" ON "finance_reconciliation_items"("status");
CREATE INDEX "finance_reconciliation_items_orderNo_idx" ON "finance_reconciliation_items"("orderNo");
CREATE INDEX "finance_reconciliation_items_outTradeNo_idx" ON "finance_reconciliation_items"("outTradeNo");
CREATE INDEX "wechat_bill_imports_status_idx" ON "wechat_bill_imports"("status");
CREATE INDEX "wechat_bill_imports_createdAt_idx" ON "wechat_bill_imports"("createdAt");
CREATE INDEX "refund_records_orderNo_idx" ON "refund_records"("orderNo");
CREATE INDEX "refund_records_status_idx" ON "refund_records"("status");
CREATE INDEX "invoice_records_orderNo_idx" ON "invoice_records"("orderNo");
CREATE INDEX "invoice_records_status_idx" ON "invoice_records"("status");

CREATE UNIQUE INDEX "product_categories_code_key" ON "product_categories"("code");
CREATE INDEX "product_categories_enabled_idx" ON "product_categories"("enabled");
CREATE INDEX "product_categories_sortOrder_idx" ON "product_categories"("sortOrder");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
CREATE INDEX "products_status_idx" ON "products"("status");
CREATE INDEX "products_sortOrder_idx" ON "products"("sortOrder");
CREATE INDEX "product_skus_productId_idx" ON "product_skus"("productId");
CREATE INDEX "product_skus_status_idx" ON "product_skus"("status");
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");
CREATE INDEX "product_images_sortOrder_idx" ON "product_images"("sortOrder");
CREATE UNIQUE INDEX "cart_items_userId_skuId_key" ON "cart_items"("userId", "skuId");
CREATE INDEX "cart_items_userId_idx" ON "cart_items"("userId");
CREATE INDEX "cart_items_skuId_idx" ON "cart_items"("skuId");
CREATE UNIQUE INDEX "mall_orders_orderNo_key" ON "mall_orders"("orderNo");
CREATE INDEX "mall_orders_userId_idx" ON "mall_orders"("userId");
CREATE INDEX "mall_orders_status_idx" ON "mall_orders"("status");
CREATE INDEX "mall_orders_createdAt_idx" ON "mall_orders"("createdAt");
CREATE INDEX "mall_order_items_orderId_idx" ON "mall_order_items"("orderId");
CREATE INDEX "mall_order_items_skuId_idx" ON "mall_order_items"("skuId");
CREATE INDEX "mall_shipments_orderId_idx" ON "mall_shipments"("orderId");
CREATE INDEX "mall_shipments_status_idx" ON "mall_shipments"("status");
CREATE INDEX "mall_after_sales_orderId_idx" ON "mall_after_sales"("orderId");
CREATE INDEX "mall_after_sales_status_idx" ON "mall_after_sales"("status");

ALTER TABLE "member_benefits" ADD CONSTRAINT "member_benefits_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "member_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "member_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_price_rules" ADD CONSTRAINT "membership_price_rules_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "member_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_reconciliation_items" ADD CONSTRAINT "finance_reconciliation_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "finance_reconciliation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_skus" ADD CONSTRAINT "product_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mall_orders" ADD CONSTRAINT "mall_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mall_order_items" ADD CONSTRAINT "mall_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mall_order_items" ADD CONSTRAINT "mall_order_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mall_shipments" ADD CONSTRAINT "mall_shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mall_after_sales" ADD CONSTRAINT "mall_after_sales_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
