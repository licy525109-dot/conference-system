ALTER TABLE "conferences"
  ADD COLUMN "groupRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxTicketsPerOrder" INTEGER;
