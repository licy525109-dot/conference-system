CREATE TABLE "external_checkin_events" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fields" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "external_checkin_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "external_checkin_attendees" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "matchKey" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "submittedValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "external_checkin_attendees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_checkin_events_publicToken_key" ON "external_checkin_events"("publicToken");
CREATE UNIQUE INDEX "external_checkin_attendees_eventId_matchKey_key" ON "external_checkin_attendees"("eventId", "matchKey");
CREATE INDEX "external_checkin_attendees_eventId_checkedInAt_idx" ON "external_checkin_attendees"("eventId", "checkedInAt");
ALTER TABLE "external_checkin_attendees" ADD CONSTRAINT "external_checkin_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "external_checkin_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
