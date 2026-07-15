-- Keep the embedding attempt-count ceiling fail-closed even if the application
-- is rolled back to a runtime whose in-code limits are higher or incomplete.
-- This is an attempt ceiling derived from the current provider-rate model; it
-- is not durable provider-dollar enforcement. Existing over-ceiling counters
-- are clamped (never reset), so the affected window remains denied.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE "embedding_rate_buckets"
SET "count" = 684
WHERE "key" LIKE 'embedding:daily:%'
  AND "count" > 684;

UPDATE "embedding_rate_buckets"
SET "count" = 20547
WHERE "key" LIKE 'embedding:monthly:%'
  AND "count" > 20547;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'embedding_attempt_count_ceiling'
      AND t.relname = 'embedding_rate_buckets'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "embedding_rate_buckets"
      ADD CONSTRAINT "embedding_attempt_count_ceiling"
      CHECK (
        ("key" NOT LIKE 'embedding:daily:%' OR "count" <= 684)
        AND ("key" NOT LIKE 'embedding:monthly:%' OR "count" <= 20547)
      ) NOT VALID;
  END IF;
END;
$$;

COMMIT;
