CREATE TYPE "NotificationChannelType" AS ENUM ('MOCK', 'WECHAT_SUBSCRIBE', 'SMS');
CREATE TYPE "NotificationTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
CREATE TYPE "NotificationTaskStatus" AS ENUM ('DRAFT', 'PENDING', 'SENDING', 'SENT', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED');
CREATE TYPE "NotificationLogStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

CREATE TABLE "admin_wechat_bindings" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "openid" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSessionAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "admin_wechat_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "templateCode" TEXT NOT NULL,
  "openid" TEXT,
  "phone" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_templates" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "status" "NotificationTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT,
  "templateKey" TEXT,
  "contentJson" JSONB NOT NULL,
  "remark" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_tasks" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "channel" "NotificationChannelType" NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'MANUAL',
  "payloadJson" JSONB,
  "status" "NotificationTaskStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_logs" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "templateId" TEXT,
  "userId" TEXT,
  "channel" "NotificationChannelType" NOT NULL,
  "recipient" TEXT,
  "status" "NotificationLogStatus" NOT NULL DEFAULT 'PENDING',
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "payloadJson" JSONB,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_wechat_bindings_adminUserId_userId_key" ON "admin_wechat_bindings"("adminUserId", "userId");
CREATE UNIQUE INDEX "admin_wechat_bindings_openid_key" ON "admin_wechat_bindings"("openid");
CREATE INDEX "admin_wechat_bindings_adminUserId_idx" ON "admin_wechat_bindings"("adminUserId");
CREATE INDEX "admin_wechat_bindings_userId_idx" ON "admin_wechat_bindings"("userId");
CREATE INDEX "admin_wechat_bindings_enabled_idx" ON "admin_wechat_bindings"("enabled");

CREATE UNIQUE INDEX "notification_subscriptions_userId_channel_templateCode_key" ON "notification_subscriptions"("userId", "channel", "templateCode");
CREATE INDEX "notification_subscriptions_userId_idx" ON "notification_subscriptions"("userId");
CREATE INDEX "notification_subscriptions_channel_idx" ON "notification_subscriptions"("channel");
CREATE INDEX "notification_subscriptions_templateCode_idx" ON "notification_subscriptions"("templateCode");
CREATE INDEX "notification_subscriptions_enabled_idx" ON "notification_subscriptions"("enabled");

CREATE UNIQUE INDEX "notification_templates_code_key" ON "notification_templates"("code");
CREATE INDEX "notification_templates_channel_idx" ON "notification_templates"("channel");
CREATE INDEX "notification_templates_status_idx" ON "notification_templates"("status");
CREATE INDEX "notification_templates_createdAt_idx" ON "notification_templates"("createdAt");

CREATE INDEX "notification_tasks_templateId_idx" ON "notification_tasks"("templateId");
CREATE INDEX "notification_tasks_channel_idx" ON "notification_tasks"("channel");
CREATE INDEX "notification_tasks_status_idx" ON "notification_tasks"("status");
CREATE INDEX "notification_tasks_scheduledAt_idx" ON "notification_tasks"("scheduledAt");
CREATE INDEX "notification_tasks_createdAt_idx" ON "notification_tasks"("createdAt");

CREATE INDEX "notification_logs_taskId_idx" ON "notification_logs"("taskId");
CREATE INDEX "notification_logs_templateId_idx" ON "notification_logs"("templateId");
CREATE INDEX "notification_logs_userId_idx" ON "notification_logs"("userId");
CREATE INDEX "notification_logs_channel_idx" ON "notification_logs"("channel");
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");
CREATE INDEX "notification_logs_createdAt_idx" ON "notification_logs"("createdAt");

ALTER TABLE "admin_wechat_bindings" ADD CONSTRAINT "admin_wechat_bindings_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_wechat_bindings" ADD CONSTRAINT "admin_wechat_bindings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_tasks" ADD CONSTRAINT "notification_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_tasks" ADD CONSTRAINT "notification_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "notification_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
