CREATE TYPE "RegistrationSource" AS ENUM ('PAYMENT', 'ADMIN_COMPLIMENTARY');

ALTER TABLE "registrations"
  ADD COLUMN "source" "RegistrationSource" NOT NULL DEFAULT 'PAYMENT';

ALTER TABLE "coupons"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "user_notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "route" TEXT,
  "payloadJson" JSONB,
  "sourceKey" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coupons_deletedAt_idx" ON "coupons"("deletedAt");
CREATE UNIQUE INDEX "user_notifications_sourceKey_key" ON "user_notifications"("sourceKey");
CREATE INDEX "user_notifications_userId_createdAt_idx" ON "user_notifications"("userId", "createdAt");
CREATE INDEX "user_notifications_userId_readAt_idx" ON "user_notifications"("userId", "readAt");
CREATE INDEX "user_notifications_type_idx" ON "user_notifications"("type");

ALTER TABLE "user_notifications"
  ADD CONSTRAINT "user_notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "promotion_rules"
SET "enabled" = false
WHERE "conferenceId" IS NULL;

INSERT INTO "notification_templates" (
  "id",
  "code",
  "name",
  "channel",
  "status",
  "title",
  "contentJson",
  "remark",
  "createdAt",
  "updatedAt"
)
VALUES (
  'system_guest_schedule_updated',
  'GUEST_SCHEDULE_UPDATED',
  '会务安排更新提醒',
  'WECHAT_SUBSCRIBE',
  'DRAFT',
  '会务安排已更新',
  '{"purpose":"GUEST_SCHEDULE_UPDATED","body":"{{会议名称}}的会务安排已更新，请进入小程序查看。","content":"{{会议名称}}的会务安排已更新，请进入小程序查看。","page":"pages/notifications/index","variables":["{{会议名称}}","{{安排名称}}","{{更新时间}}"]}'::jsonb,
  '请填写微信公众平台提供的订阅消息模板 ID，并按该模板字段在高级模式配置 wechatData 后启用。',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
