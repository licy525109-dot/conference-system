ALTER TABLE "users" ADD COLUMN "realName" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3), ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "businessOwnerUserId" TEXT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessOwnerUserId_fkey"
  FOREIGN KEY ("businessOwnerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "guest_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT, "name" TEXT NOT NULL, "phone" TEXT NOT NULL,
  "company" TEXT, "title" TEXT, "commonFormJson" JSONB, "boundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guest_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guest_profiles_userId_key" ON "guest_profiles"("userId");
CREATE INDEX "guest_profiles_phone_idx" ON "guest_profiles"("phone");
ALTER TABLE "registration_attendees" ADD COLUMN "guestProfileId" TEXT;
ALTER TABLE "registration_attendees" ADD CONSTRAINT "registration_attendees_guestProfileId_fkey"
  FOREIGN KEY ("guestProfileId") REFERENCES "guest_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "registration_attendees_guestProfileId_idx" ON "registration_attendees"("guestProfileId");
CREATE TABLE "guest_claims" (
  "id" TEXT NOT NULL PRIMARY KEY, "guestProfileId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_claims_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "guest_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guest_claims_tokenHash_key" ON "guest_claims"("tokenHash");
CREATE INDEX "guest_claims_guestProfileId_idx" ON "guest_claims"("guestProfileId");
CREATE TABLE "admin_alert_recipients" (
  "id" TEXT PRIMARY KEY, "adminUserId" TEXT NOT NULL, "integrationId" TEXT NOT NULL,
  "wecomUserId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
  "enabledSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "admin_alert_recipients_adminUserId_key" ON "admin_alert_recipients"("adminUserId");
CREATE TABLE "admin_registration_alerts" (
  "id" TEXT PRIMARY KEY, "registrationId" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "payloadJson" JSONB NOT NULL, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstAttemptAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_registration_alerts_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "admin_alert_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "admin_registration_alerts_registrationId_recipientId_key" ON "admin_registration_alerts"("registrationId", "recipientId");
CREATE INDEX "admin_registration_alerts_status_nextAttemptAt_idx" ON "admin_registration_alerts"("status", "nextAttemptAt");
CREATE INDEX "admin_registration_alerts_recipientId_status_leaseUntil_idx" ON "admin_registration_alerts"("recipientId", "status", "leaseUntil");
