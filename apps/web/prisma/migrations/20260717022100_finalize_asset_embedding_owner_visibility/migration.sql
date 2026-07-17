-- Finalize owner visibility in its own retryable transaction. The preceding
-- migration already protects new writes with NOT VALID constraints; these
-- validation scans can be retried independently without re-adding constraints.
BEGIN;

SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "asset_embeddings"
  VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_not_null";

ALTER TABLE "asset_embeddings"
  VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_fkey";

-- PostgreSQL can satisfy SET NOT NULL from the validated CHECK without a
-- second table scan.
ALTER TABLE "asset_embeddings"
  ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "asset_embeddings"
  DROP CONSTRAINT "asset_embeddings_owner_user_id_not_null";

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
