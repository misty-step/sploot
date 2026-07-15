-- Preserve the terminal revival cap across rollback to a runtime that predates
-- processing claim tokens and the explicit terminal_at predicate. Such a
-- runtime can otherwise move a terminal row to processing or ready while
-- leaving terminal_at set, bypassing the one-revival budget.
BEGIN;

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

COMMIT;
