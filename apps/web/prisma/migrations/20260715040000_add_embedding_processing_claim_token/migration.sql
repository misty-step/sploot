-- A timestamp is not a safe worker-generation fence: the canonical updatedAt
-- trigger has millisecond precision, so two claims can receive the same value.
-- A random token gives every acquired processing generation a unique identity.
-- The state check is added NOT VALID here and validated in its own migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "asset_embeddings"
  ADD COLUMN IF NOT EXISTS "processing_claim_token" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'asset_embeddings_processing_claim_token_state'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "asset_embeddings"
      ADD CONSTRAINT "asset_embeddings_processing_claim_token_state"
      CHECK ("processing_claim_token" IS NULL OR "status" = 'processing')
      NOT VALID;
  END IF;
END;
$$;

COMMIT;
