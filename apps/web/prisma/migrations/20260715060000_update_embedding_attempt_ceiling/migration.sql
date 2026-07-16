-- The original attempt ceiling migration is immutable once it can have been
-- applied. This additive correction replaces its point-in-time provider-rate
-- projection with the refreshed policy snapshot without rewriting history.
-- Counts remain attempts, not durable dollar admission or reconciliation.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE "embedding_rate_buckets"
SET "count" = 2272
WHERE "key" LIKE 'embedding:daily:%'
  AND "count" > 2272;

UPDATE "embedding_rate_buckets"
SET "count" = 68181
WHERE "key" LIKE 'embedding:monthly:%'
  AND "count" > 68181;

ALTER TABLE "embedding_rate_buckets"
  DROP CONSTRAINT IF EXISTS "embedding_attempt_count_ceiling";

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
        ("key" NOT LIKE 'embedding:daily:%' OR "count" <= 2272)
        AND ("key" NOT LIKE 'embedding:monthly:%' OR "count" <= 68181)
      ) NOT VALID;
  END IF;
END;
$$;

COMMIT;
