-- Validation is deliberately a separate transaction. ADD NOT VALID commits
-- before this scan so ACCESS EXCLUSIVE is not retained through validation.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'embedding_attempt_count_ceiling'
      AND t.relname = 'embedding_rate_buckets'
      AND n.nspname = 'public'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE "embedding_rate_buckets"
      VALIDATE CONSTRAINT "embedding_attempt_count_ceiling";
  END IF;
END;
$$;

COMMIT;
