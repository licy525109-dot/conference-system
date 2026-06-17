-- CreateEnum
CREATE TYPE "CustomerGroupMessageStatus" AS ENUM ('DRAFT', 'WAITING_CONFIRM', 'SENDING', 'SENT', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CheckinActionType" AS ENUM ('VERIFY', 'MANUAL', 'REVOKE');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCESS', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED');

-- CreateEnum
CREATE TYPE "CouponClaimStatus" AS ENUM ('CLAIMED', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "inventory_alert_rules" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholdRemaining" INTEGER NOT NULL DEFAULT 10,
    "notifyMode" TEXT NOT NULL DEFAULT 'ADMIN_ONLY',
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_alert_logs" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "remainingStock" INTEGER NOT NULL,
    "thresholdRemaining" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" TEXT NOT NULL,
    "wecomChatId" TEXT,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerName" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_welcome_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_welcome_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group_message_tasks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conferenceId" TEXT,
    "contentJson" JSONB NOT NULL,
    "targetGroupIds" JSONB,
    "status" "CustomerGroupMessageStatus" NOT NULL DEFAULT 'DRAFT',
    "wecomTaskId" TEXT,
    "needConfirm" BOOLEAN NOT NULL DEFAULT true,
    "confirmDeadline" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_group_message_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group_message_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "groupId" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CONFIRM',
    "resultJson" JSONB,
    "errorReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_group_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'TEXT',
    "contentText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INDEXED',
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_question_logs" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT NOT NULL,
    "userId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "matchedJson" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_question_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_reply_rules" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT,
    "keyword" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_reply_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_campaigns" (
    "id" TEXT NOT NULL,
    "conferenceId" TEXT,
    "name" TEXT NOT NULL,
    "claimCode" TEXT NOT NULL,
    "qrScene" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "totalLimit" INTEGER,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_campaign_coupons" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_campaign_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_claims" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CouponClaimStatus" NOT NULL DEFAULT 'CLAIMED',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_logs" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "action" "CheckinActionType" NOT NULL,
    "beforeStatus" "CheckInStatus",
    "afterStatus" "CheckInStatus" NOT NULL,
    "operatorId" TEXT,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "refundNo" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "amountCent" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "rejectReason" TEXT,
    "provider" "PaymentProvider",
    "providerRefundId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_applications" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "taxNo" TEXT,
    "amountCent" INTEGER NOT NULL,
    "email" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'REQUESTED',
    "rejectReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_bills" (
    "id" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "billType" TEXT NOT NULL DEFAULT 'TRADE',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "downloadUrl" TEXT,
    "storagePath" TEXT,
    "summaryJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_results" (
    "id" TEXT NOT NULL,
    "billId" TEXT,
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

    CONSTRAINT "reconciliation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_alert_rules_conferenceId_key" ON "inventory_alert_rules"("conferenceId");

-- CreateIndex
CREATE INDEX "inventory_alert_rules_enabled_idx" ON "inventory_alert_rules"("enabled");

-- CreateIndex
CREATE INDEX "inventory_alert_rules_lastScannedAt_idx" ON "inventory_alert_rules"("lastScannedAt");

-- CreateIndex
CREATE INDEX "inventory_alert_logs_conferenceId_idx" ON "inventory_alert_logs"("conferenceId");

-- CreateIndex
CREATE INDEX "inventory_alert_logs_skuId_idx" ON "inventory_alert_logs"("skuId");

-- CreateIndex
CREATE INDEX "inventory_alert_logs_status_idx" ON "inventory_alert_logs"("status");

-- CreateIndex
CREATE INDEX "inventory_alert_logs_createdAt_idx" ON "inventory_alert_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_wecomChatId_key" ON "customer_groups"("wecomChatId");

-- CreateIndex
CREATE INDEX "customer_groups_ownerUserId_idx" ON "customer_groups"("ownerUserId");

-- CreateIndex
CREATE INDEX "customer_groups_status_idx" ON "customer_groups"("status");

-- CreateIndex
CREATE INDEX "customer_groups_createdAt_idx" ON "customer_groups"("createdAt");

-- CreateIndex
CREATE INDEX "group_welcome_templates_enabled_idx" ON "group_welcome_templates"("enabled");

-- CreateIndex
CREATE INDEX "group_welcome_templates_createdAt_idx" ON "group_welcome_templates"("createdAt");

-- CreateIndex
CREATE INDEX "customer_group_message_tasks_conferenceId_idx" ON "customer_group_message_tasks"("conferenceId");

-- CreateIndex
CREATE INDEX "customer_group_message_tasks_status_idx" ON "customer_group_message_tasks"("status");

-- CreateIndex
CREATE INDEX "customer_group_message_tasks_wecomTaskId_idx" ON "customer_group_message_tasks"("wecomTaskId");

-- CreateIndex
CREATE INDEX "customer_group_message_tasks_createdAt_idx" ON "customer_group_message_tasks"("createdAt");

-- CreateIndex
CREATE INDEX "customer_group_message_logs_taskId_idx" ON "customer_group_message_logs"("taskId");

-- CreateIndex
CREATE INDEX "customer_group_message_logs_groupId_idx" ON "customer_group_message_logs"("groupId");

-- CreateIndex
CREATE INDEX "customer_group_message_logs_ownerUserId_idx" ON "customer_group_message_logs"("ownerUserId");

-- CreateIndex
CREATE INDEX "customer_group_message_logs_status_idx" ON "customer_group_message_logs"("status");

-- CreateIndex
CREATE INDEX "customer_group_message_logs_createdAt_idx" ON "customer_group_message_logs"("createdAt");

-- CreateIndex
CREATE INDEX "knowledge_bases_conferenceId_idx" ON "knowledge_bases"("conferenceId");

-- CreateIndex
CREATE INDEX "knowledge_bases_enabled_idx" ON "knowledge_bases"("enabled");

-- CreateIndex
CREATE INDEX "knowledge_documents_knowledgeBaseId_idx" ON "knowledge_documents"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "knowledge_documents_status_idx" ON "knowledge_documents"("status");

-- CreateIndex
CREATE INDEX "knowledge_documents_createdAt_idx" ON "knowledge_documents"("createdAt");

-- CreateIndex
CREATE INDEX "knowledge_chunks_documentId_idx" ON "knowledge_chunks"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_documentId_chunkIndex_key" ON "knowledge_chunks"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "ai_question_logs_conferenceId_idx" ON "ai_question_logs"("conferenceId");

-- CreateIndex
CREATE INDEX "ai_question_logs_userId_idx" ON "ai_question_logs"("userId");

-- CreateIndex
CREATE INDEX "ai_question_logs_createdAt_idx" ON "ai_question_logs"("createdAt");

-- CreateIndex
CREATE INDEX "auto_reply_rules_knowledgeBaseId_idx" ON "auto_reply_rules"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "auto_reply_rules_enabled_idx" ON "auto_reply_rules"("enabled");

-- CreateIndex
CREATE INDEX "auto_reply_rules_priority_idx" ON "auto_reply_rules"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_campaigns_claimCode_key" ON "coupon_campaigns"("claimCode");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_campaigns_qrScene_key" ON "coupon_campaigns"("qrScene");

-- CreateIndex
CREATE INDEX "coupon_campaigns_conferenceId_idx" ON "coupon_campaigns"("conferenceId");

-- CreateIndex
CREATE INDEX "coupon_campaigns_enabled_idx" ON "coupon_campaigns"("enabled");

-- CreateIndex
CREATE INDEX "coupon_campaigns_createdAt_idx" ON "coupon_campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "coupon_campaign_coupons_campaignId_idx" ON "coupon_campaign_coupons"("campaignId");

-- CreateIndex
CREATE INDEX "coupon_campaign_coupons_couponId_idx" ON "coupon_campaign_coupons"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_campaign_coupons_campaignId_couponId_key" ON "coupon_campaign_coupons"("campaignId", "couponId");

-- CreateIndex
CREATE INDEX "coupon_claims_campaignId_idx" ON "coupon_claims"("campaignId");

-- CreateIndex
CREATE INDEX "coupon_claims_couponId_idx" ON "coupon_claims"("couponId");

-- CreateIndex
CREATE INDEX "coupon_claims_userId_idx" ON "coupon_claims"("userId");

-- CreateIndex
CREATE INDEX "coupon_claims_status_idx" ON "coupon_claims"("status");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_claims_campaignId_couponId_userId_key" ON "coupon_claims"("campaignId", "couponId", "userId");

-- CreateIndex
CREATE INDEX "checkin_logs_attendeeId_idx" ON "checkin_logs"("attendeeId");

-- CreateIndex
CREATE INDEX "checkin_logs_registrationId_idx" ON "checkin_logs"("registrationId");

-- CreateIndex
CREATE INDEX "checkin_logs_action_idx" ON "checkin_logs"("action");

-- CreateIndex
CREATE INDEX "checkin_logs_operatorId_idx" ON "checkin_logs"("operatorId");

-- CreateIndex
CREATE INDEX "checkin_logs_createdAt_idx" ON "checkin_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_refundNo_key" ON "refunds"("refundNo");

-- CreateIndex
CREATE INDEX "refunds_orderNo_idx" ON "refunds"("orderNo");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_userId_idx" ON "refunds"("userId");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_applications_invoiceNo_key" ON "invoice_applications"("invoiceNo");

-- CreateIndex
CREATE INDEX "invoice_applications_orderNo_idx" ON "invoice_applications"("orderNo");

-- CreateIndex
CREATE INDEX "invoice_applications_orderId_idx" ON "invoice_applications"("orderId");

-- CreateIndex
CREATE INDEX "invoice_applications_userId_idx" ON "invoice_applications"("userId");

-- CreateIndex
CREATE INDEX "invoice_applications_status_idx" ON "invoice_applications"("status");

-- CreateIndex
CREATE INDEX "invoice_applications_createdAt_idx" ON "invoice_applications"("createdAt");

-- CreateIndex
CREATE INDEX "wechat_bills_status_idx" ON "wechat_bills"("status");

-- CreateIndex
CREATE INDEX "wechat_bills_createdAt_idx" ON "wechat_bills"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_bills_billDate_billType_key" ON "wechat_bills"("billDate", "billType");

-- CreateIndex
CREATE INDEX "reconciliation_results_billId_idx" ON "reconciliation_results"("billId");

-- CreateIndex
CREATE INDEX "reconciliation_results_type_idx" ON "reconciliation_results"("type");

-- CreateIndex
CREATE INDEX "reconciliation_results_status_idx" ON "reconciliation_results"("status");

-- CreateIndex
CREATE INDEX "reconciliation_results_orderNo_idx" ON "reconciliation_results"("orderNo");

-- CreateIndex
CREATE INDEX "reconciliation_results_outTradeNo_idx" ON "reconciliation_results"("outTradeNo");

-- CreateIndex
CREATE INDEX "reconciliation_results_createdAt_idx" ON "reconciliation_results"("createdAt");

-- AddForeignKey
ALTER TABLE "inventory_alert_rules" ADD CONSTRAINT "inventory_alert_rules_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alert_logs" ADD CONSTRAINT "inventory_alert_logs_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_message_tasks" ADD CONSTRAINT "customer_group_message_tasks_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_message_logs" ADD CONSTRAINT "customer_group_message_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "customer_group_message_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_message_logs" ADD CONSTRAINT "customer_group_message_logs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_question_logs" ADD CONSTRAINT "ai_question_logs_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_campaigns" ADD CONSTRAINT "coupon_campaigns_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_campaign_coupons" ADD CONSTRAINT "coupon_campaign_coupons_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "coupon_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_campaign_coupons" ADD CONSTRAINT "coupon_campaign_coupons_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "coupon_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_logs" ADD CONSTRAINT "checkin_logs_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "registration_attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_logs" ADD CONSTRAINT "checkin_logs_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_logs" ADD CONSTRAINT "checkin_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_applications" ADD CONSTRAINT "invoice_applications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_applications" ADD CONSTRAINT "invoice_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_results" ADD CONSTRAINT "reconciliation_results_billId_fkey" FOREIGN KEY ("billId") REFERENCES "wechat_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

