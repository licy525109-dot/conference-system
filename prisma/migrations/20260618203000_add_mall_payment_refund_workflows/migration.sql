-- CreateTable
CREATE TABLE "mall_payments" (
    "id" TEXT NOT NULL,
    "mallOrderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MOCK',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "outTradeNo" TEXT NOT NULL,
    "transactionId" TEXT,
    "amountCent" INTEGER NOT NULL,
    "notifyRawId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mall_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mall_refunds" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "outRefundNo" TEXT NOT NULL,
    "mallOrderId" TEXT NOT NULL,
    "afterSaleId" TEXT,
    "provider" "PaymentProvider",
    "providerRefundId" TEXT,
    "amountCent" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "rejectReason" TEXT,
    "failedReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mall_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mall_payments_outTradeNo_key" ON "mall_payments"("outTradeNo");

-- CreateIndex
CREATE UNIQUE INDEX "mall_payments_transactionId_key" ON "mall_payments"("transactionId");

-- CreateIndex
CREATE INDEX "mall_payments_mallOrderId_idx" ON "mall_payments"("mallOrderId");

-- CreateIndex
CREATE INDEX "mall_payments_outTradeNo_idx" ON "mall_payments"("outTradeNo");

-- CreateIndex
CREATE INDEX "mall_payments_status_idx" ON "mall_payments"("status");

-- CreateIndex
CREATE INDEX "mall_payments_createdAt_idx" ON "mall_payments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mall_refunds_refundNo_key" ON "mall_refunds"("refundNo");

-- CreateIndex
CREATE UNIQUE INDEX "mall_refunds_outRefundNo_key" ON "mall_refunds"("outRefundNo");

-- CreateIndex
CREATE UNIQUE INDEX "mall_refunds_providerRefundId_key" ON "mall_refunds"("providerRefundId");

-- CreateIndex
CREATE INDEX "mall_refunds_mallOrderId_idx" ON "mall_refunds"("mallOrderId");

-- CreateIndex
CREATE INDEX "mall_refunds_afterSaleId_idx" ON "mall_refunds"("afterSaleId");

-- CreateIndex
CREATE INDEX "mall_refunds_status_idx" ON "mall_refunds"("status");

-- CreateIndex
CREATE INDEX "mall_refunds_createdAt_idx" ON "mall_refunds"("createdAt");

-- AddForeignKey
ALTER TABLE "mall_payments" ADD CONSTRAINT "mall_payments_mallOrderId_fkey" FOREIGN KEY ("mallOrderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mall_refunds" ADD CONSTRAINT "mall_refunds_mallOrderId_fkey" FOREIGN KEY ("mallOrderId") REFERENCES "mall_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mall_refunds" ADD CONSTRAINT "mall_refunds_afterSaleId_fkey" FOREIGN KEY ("afterSaleId") REFERENCES "mall_after_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
