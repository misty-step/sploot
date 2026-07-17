-- A resumable, bounded backfill authority for rolling databases. Each call
-- updates at most 10,000 rows in its own transaction. Deployment orchestration
-- drains calls until the remaining count reaches zero before enforcement.

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

-- Do not execute a batch here. Prisma marks this migration applied after its
-- transaction, so a one-shot CALL would falsely claim a larger legacy table was
-- drained. The deploy orchestrator owns the repeatable 10k drain and readback.

COMMIT;
