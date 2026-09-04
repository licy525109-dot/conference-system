ALTER TABLE "user_notifications"
ADD COLUMN "dismissedAt" TIMESTAMP(3);

CREATE INDEX "user_notifications_userId_dismissedAt_createdAt_idx"
ON "user_notifications"("userId", "dismissedAt", "createdAt");
