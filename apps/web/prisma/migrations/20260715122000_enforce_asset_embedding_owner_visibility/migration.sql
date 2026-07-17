-- Phase-two admission: once the phase-one projection is drained, add both
-- constraints as NOT VALID. They enforce all new writes while keeping the
-- validation scans in the following migration and transaction.
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
  ADD CONSTRAINT "asset_embeddings_owner_user_id_not_null"
  CHECK ("owner_user_id" IS NOT NULL)
  NOT VALID;

ALTER TABLE "asset_embeddings"
  ADD CONSTRAINT "asset_embeddings_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

COMMIT;
