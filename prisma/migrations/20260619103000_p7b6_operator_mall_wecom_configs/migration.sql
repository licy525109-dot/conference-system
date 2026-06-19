ALTER TABLE "wecom_integrations"
  ADD COLUMN "groupRobotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "groupRobotWebhookUrlEnc" TEXT,
  ADD COLUMN "groupRobotSecretEnc" TEXT,
  ADD COLUMN "groupRobotName" TEXT;

CREATE TABLE "mall_payment_configs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'default',
  "mode" TEXT NOT NULL DEFAULT 'disabled',
  "notifyUrl" TEXT,
  "allowMockPayment" BOOLEAN NOT NULL DEFAULT false,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mall_payment_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mall_payment_configs_name_key" ON "mall_payment_configs"("name");
CREATE INDEX "mall_payment_configs_mode_idx" ON "mall_payment_configs"("mode");
