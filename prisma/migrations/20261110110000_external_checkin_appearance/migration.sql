ALTER TABLE "external_checkin_events" ADD COLUMN "appearance" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "external_checkin_assets" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_checkin_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_checkin_assets_eventId_sha256_key" ON "external_checkin_assets"("eventId", "sha256");
ALTER TABLE "external_checkin_assets" ADD CONSTRAINT "external_checkin_assets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "external_checkin_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
