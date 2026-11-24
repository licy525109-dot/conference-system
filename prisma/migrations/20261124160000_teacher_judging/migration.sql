CREATE TABLE "judging_events" (
 "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "rehearsal" BOOLEAN NOT NULL, "config" JSONB NOT NULL, "control" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "edition" INTEGER NOT NULL DEFAULT 1, "phase" TEXT NOT NULL DEFAULT 'SETUP',
 "staffIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "confirmerId" TEXT, "publishedEdition" INTEGER,
 "publishedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "judging_ballots" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL REFERENCES "judging_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sessionKey" TEXT NOT NULL, "judgeKey" TEXT NOT NULL, "teacherKey" TEXT NOT NULL, "role" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "rubric" JSONB NOT NULL, "answers" JSONB NOT NULL, "units" INTEGER, "status" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "judging_ballots_eventId_sessionKey_judgeKey_key" ON "judging_ballots"("eventId","sessionKey","judgeKey");
CREATE INDEX "judging_ballots_eventId_teacherKey_idx" ON "judging_ballots"("eventId","teacherKey");
CREATE TABLE "judging_editions" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL REFERENCES "judging_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "edition" INTEGER NOT NULL, "revision" INTEGER NOT NULL, "snapshot" JSONB NOT NULL,
 "confirmedBy" TEXT NOT NULL, "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "judging_editions_eventId_edition_key" ON "judging_editions"("eventId","edition");
CREATE TABLE "judging_audit" (
 "id" TEXT PRIMARY KEY, "eventId" TEXT NOT NULL REFERENCES "judging_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "edition" INTEGER NOT NULL, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, "detail" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "judging_audit_eventId_createdAt_idx" ON "judging_audit"("eventId","createdAt");
