-- Validate the terminal-revival constraint after its additive migration has
-- committed, so the online lock window is bounded and replay is harmless.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'asset_embeddings_revive_count_bounded'
      AND t.relname = 'asset_embeddings'
      AND n.nspname = 'public'
      AND NOT c.convalidated
  ) THEN
    ALTER TABLE "asset_embeddings"
      VALIDATE CONSTRAINT "asset_embeddings_revive_count_bounded";
  END IF;
END;
$$;

COMMIT;
