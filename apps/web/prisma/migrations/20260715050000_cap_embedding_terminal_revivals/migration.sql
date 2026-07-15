-- A terminal embedding may receive one owner-authorized recovery cycle over
-- its lifetime. Enforce the budget in Postgres so an older runtime rolled
-- back after this migration cannot repeatedly reset poisoned media.
BEGIN;

ALTER TABLE "asset_embeddings"
  ADD COLUMN "revive_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "asset_embeddings"
  ADD CONSTRAINT "asset_embeddings_revive_count_bounded"
  CHECK ("revive_count" >= 0 AND "revive_count" <= 1);

CREATE OR REPLACE FUNCTION "enforce_asset_embedding_revival_budget"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."terminal_at" IS NOT NULL
     AND NEW."terminal_at" IS NOT NULL
     AND (
       NEW."image_embedding" IS NOT NULL
       OR NEW."status" IN ('pending', 'processing', 'ready')
     ) THEN
    RAISE EXCEPTION 'terminal embedding cannot be claimed or written outside revival'
      USING ERRCODE = '23514',
            CONSTRAINT = 'asset_embeddings_revive_count_bounded';
  END IF;

  IF NEW."revive_count" < OLD."revive_count" THEN
    RAISE EXCEPTION 'asset embedding revive_count cannot decrease'
      USING ERRCODE = '23514',
            CONSTRAINT = 'asset_embeddings_revive_count_bounded';
  END IF;

  IF OLD."terminal_at" IS NOT NULL
     AND NEW."terminal_at" IS NULL
     AND NEW."status" = 'pending'
     AND NEW."attempt_count" = 0 THEN
    IF OLD."revive_count" >= 1 THEN
      RAISE EXCEPTION 'asset embedding terminal revival budget exhausted'
        USING ERRCODE = '23514',
              CONSTRAINT = 'asset_embeddings_revive_count_bounded';
    END IF;

    NEW."revive_count" := OLD."revive_count" + 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "asset_embeddings_revival_budget"
BEFORE UPDATE ON "asset_embeddings"
FOR EACH ROW
EXECUTE FUNCTION "enforce_asset_embedding_revival_budget"();

COMMIT;
