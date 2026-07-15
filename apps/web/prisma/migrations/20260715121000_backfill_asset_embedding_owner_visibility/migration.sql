-- A resumable, bounded backfill for rolling databases. The migration executes
-- one batch so migrate deploy never takes an unbounded table lock; operators
-- can safely rerun the procedure until the remaining count reaches zero before
-- applying the enforcement migration.

BEGIN;

CREATE OR REPLACE PROCEDURE "sploot_backfill_asset_embedding_owner_visibility"(
  p_batch_size INTEGER DEFAULT 10000
)
LANGUAGE plpgsql
AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 10000 THEN
    RAISE EXCEPTION 'asset embedding visibility batch must be between 1 and 10000';
  END IF;

  WITH batch AS (
    SELECT
      embedding.ctid,
      asset."owner_user_id" AS owner_user_id,
      asset."deleted_at" AS asset_deleted_at
    FROM "asset_embeddings" AS embedding
    INNER JOIN "assets" AS asset ON asset."id" = embedding."asset_id"
    WHERE embedding."owner_user_id" IS DISTINCT FROM asset."owner_user_id"
       OR embedding."asset_deleted_at" IS DISTINCT FROM asset."deleted_at"
    ORDER BY embedding."asset_id"
    LIMIT p_batch_size
    FOR UPDATE OF embedding SKIP LOCKED
  )
  UPDATE "asset_embeddings" AS embedding
  SET
    "owner_user_id" = batch.owner_user_id,
    "asset_deleted_at" = batch.asset_deleted_at
  FROM batch
  WHERE embedding.ctid = batch.ctid;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RAISE NOTICE 'asset embedding visibility backfill changed % rows', changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION "sploot_asset_embedding_visibility_backfill_remaining"()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM "asset_embeddings" AS embedding
  INNER JOIN "assets" AS asset ON asset."id" = embedding."asset_id"
  WHERE embedding."owner_user_id" IS DISTINCT FROM asset."owner_user_id"
     OR embedding."asset_deleted_at" IS DISTINCT FROM asset."deleted_at";
$$;

-- Fresh CI databases fit in one bounded batch. Legacy databases with more rows
-- remain resumable through CALL ...() and are intentionally not forced through
-- the later NOT NULL/FK migration until the readback is zero.
CALL "sploot_backfill_asset_embedding_owner_visibility"(10000);

COMMIT;
