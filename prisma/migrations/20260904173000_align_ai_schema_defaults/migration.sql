ALTER TABLE "ai_question_logs"
  ALTER COLUMN "provider" SET DEFAULT 'LOCAL_FALLBACK';

DROP INDEX IF EXISTS "knowledge_bases_conferenceId_idx";
