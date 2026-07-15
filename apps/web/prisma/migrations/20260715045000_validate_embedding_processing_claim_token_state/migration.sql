-- Validate the token/state invariant after the additive column migration has
-- committed, keeping the online lock window bounded and explicit.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'asset_embeddings_processing_claim_token_state'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE "asset_embeddings"
      VALIDATE CONSTRAINT "asset_embeddings_processing_claim_token_state";
  END IF;
END;
$$;

COMMIT;
