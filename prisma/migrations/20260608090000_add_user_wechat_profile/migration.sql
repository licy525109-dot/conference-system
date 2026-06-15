ALTER TABLE "users"
  ADD COLUMN "wechatNickname" TEXT,
  ADD COLUMN "wechatAvatarUrl" TEXT,
  ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);
