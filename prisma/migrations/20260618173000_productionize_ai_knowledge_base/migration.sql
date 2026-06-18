ALTER TABLE "knowledge_bases"
  ADD COLUMN "scopeDescription" TEXT,
  ADD COLUMN "fallbackText" TEXT,
  ADD COLUMN "citationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "loggingEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "knowledge_documents"
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "indexedAt" TIMESTAMP(3);

ALTER TABLE "ai_question_logs"
  ADD COLUMN "knowledgeBaseId" TEXT,
  ADD COLUMN "matchedDocumentId" TEXT,
  ADD COLUMN "matchedChunkId" TEXT,
  ADD COLUMN "referencesJson" JSONB,
  ADD COLUMN "hit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fallback" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "errorReason" TEXT;

UPDATE "ai_question_logs"
SET "provider" = 'LOCAL_FALLBACK'
WHERE "provider" IS NULL OR "provider" = 'mock';

UPDATE "knowledge_documents"
SET "status" = 'ACTIVE',
    "indexedAt" = COALESCE("indexedAt", "updatedAt", "createdAt")
WHERE "status" = 'INDEXED';

UPDATE "knowledge_documents"
SET "indexedAt" = COALESCE("indexedAt", "updatedAt", "createdAt")
WHERE "chunkCount" > 0;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "conferenceId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "knowledge_bases"
)
DELETE FROM "knowledge_bases"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "knowledge_bases_conferenceId_key" ON "knowledge_bases"("conferenceId");

CREATE TABLE "ai_suggestions" (
  "id" TEXT NOT NULL,
  "conferenceId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_suggestions_conferenceId_idx" ON "ai_suggestions"("conferenceId");
CREATE INDEX "ai_suggestions_enabled_idx" ON "ai_suggestions"("enabled");
CREATE INDEX "ai_suggestions_sortOrder_idx" ON "ai_suggestions"("sortOrder");

CREATE TABLE "ai_configs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT NOT NULL DEFAULT 'LOCAL_FALLBACK',
  "model" TEXT NOT NULL DEFAULT 'local-keyword',
  "temperature" INTEGER NOT NULL DEFAULT 0,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 800,
  "fallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
  "citationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "questionLogEnabled" BOOLEAN NOT NULL DEFAULT true,
  "settingsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_configs_name_key" ON "ai_configs"("name");
CREATE INDEX "ai_configs_enabled_idx" ON "ai_configs"("enabled");

CREATE INDEX "ai_question_logs_knowledgeBaseId_idx" ON "ai_question_logs"("knowledgeBaseId");
CREATE INDEX "ai_question_logs_matchedDocumentId_idx" ON "ai_question_logs"("matchedDocumentId");
CREATE INDEX "ai_question_logs_matchedChunkId_idx" ON "ai_question_logs"("matchedChunkId");
CREATE INDEX "ai_question_logs_hit_idx" ON "ai_question_logs"("hit");
CREATE INDEX "ai_question_logs_fallback_idx" ON "ai_question_logs"("fallback");

ALTER TABLE "ai_question_logs"
  ADD CONSTRAINT "ai_question_logs_knowledgeBaseId_fkey"
  FOREIGN KEY ("knowledgeBaseId") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_question_logs"
  ADD CONSTRAINT "ai_question_logs_matchedDocumentId_fkey"
  FOREIGN KEY ("matchedDocumentId") REFERENCES "knowledge_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_question_logs"
  ADD CONSTRAINT "ai_question_logs_matchedChunkId_fkey"
  FOREIGN KEY ("matchedChunkId") REFERENCES "knowledge_chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
