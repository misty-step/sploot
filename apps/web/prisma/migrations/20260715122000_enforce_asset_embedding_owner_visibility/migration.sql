-- Enforcement is deliberately separate from additive DDL and backfill. It is
-- fail-closed for legacy databases that still need another resumable batch.
BEGIN;

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
DECLARE
  remaining BIGINT;
BEGIN
  SELECT "sploot_asset_embedding_visibility_backfill_remaining"()
  INTO remaining;
  IF remaining <> 0 THEN
    RAISE EXCEPTION
      'asset embedding visibility enforcement refused: % rows remain; rerun CALL sploot_backfill_asset_embedding_owner_visibility() first',
      remaining;
  END IF;
END
$$;

ALTER TABLE "asset_embeddings"
  ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "asset_embeddings"
  ADD CONSTRAINT "asset_embeddings_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "asset_embeddings"
  VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'asset_embeddings'::regclass
      AND attname = 'owner_user_id'
      AND attnotnull
  ) THEN
    RAISE EXCEPTION 'asset_embeddings.owner_user_id final NOT NULL contract is missing';
  END IF;
END
$$;

COMMIT;
