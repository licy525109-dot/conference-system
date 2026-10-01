ALTER TABLE "invitation_campaigns" ALTER COLUMN "conferenceId" DROP NOT NULL;

CREATE TABLE "invitation_wechat_configs" (
  "id" TEXT NOT NULL DEFAULT 'official',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "appId" TEXT NOT NULL DEFAULT '',
  "appSecretEnc" TEXT,
  "verificationFileName" TEXT,
  "verificationContent" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invitation_wechat_configs_pkey" PRIMARY KEY ("id")
);
