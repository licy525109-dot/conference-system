CREATE TABLE "invitation_campaigns" (
  "id" TEXT NOT NULL, "conferenceId" TEXT NOT NULL, "draftJson" JSONB NOT NULL,
  "publishedJson" JSONB, "draftRevision" INTEGER NOT NULL DEFAULT 1,
  "publishedRevision" INTEGER NOT NULL DEFAULT 0, "publishedDraftRevision" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "invitation_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitation_campaigns_conferenceId_key" ON "invitation_campaigns"("conferenceId");
ALTER TABLE "invitation_campaigns" ADD CONSTRAINT "invitation_campaigns_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "invitation_campaign_members" (
  "campaignId" TEXT NOT NULL, "adminId" TEXT NOT NULL,
  CONSTRAINT "invitation_campaign_members_pkey" PRIMARY KEY ("campaignId", "adminId")
);
ALTER TABLE "invitation_campaign_members" ADD CONSTRAINT "invitation_campaign_members_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "invitation_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_campaign_members" ADD CONSTRAINT "invitation_campaign_members_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "invitation_campaign_members_adminId_idx" ON "invitation_campaign_members"("adminId");
CREATE TABLE "conference_invitations" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "token" TEXT NOT NULL,
  "name" TEXT NOT NULL, "salutation" TEXT NOT NULL DEFAULT '老师', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "conference_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conference_invitations_token_key" ON "conference_invitations"("token");
CREATE INDEX "conference_invitations_campaignId_createdBy_createdAt_idx" ON "conference_invitations"("campaignId", "createdBy", "createdAt");
ALTER TABLE "conference_invitations" ADD CONSTRAINT "conference_invitations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "invitation_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conference_invitations" ADD CONSTRAINT "conference_invitations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD COLUMN "invitationId" TEXT;
CREATE INDEX "orders_invitationId_idx" ON "orders"("invitationId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "conference_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
