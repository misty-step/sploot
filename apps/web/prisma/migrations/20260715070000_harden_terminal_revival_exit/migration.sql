-- A terminal row may leave quarantine only through the one bounded revival
-- transition. In particular, terminal_at -> NULL with status=failed must not
-- be a legacy escape hatch that lets a worker spend provider capacity without
-- consuming the revival budget.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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

  IF OLD."terminal_at" IS NOT NULL AND NEW."terminal_at" IS NULL THEN
    IF NEW."status" <> 'pending'
       OR NEW."attempt_count" <> 0
       OR NEW."image_embedding" IS NOT NULL
       OR NEW."processing_claim_token" IS NOT NULL
       OR NEW."next_attempt_at" IS NOT NULL
       OR NEW."error" IS NOT NULL
       OR NEW."revive_count" <> OLD."revive_count" THEN
      RAISE EXCEPTION 'terminal embedding may exit only through bounded revival transition'
        USING ERRCODE = '23514',
              CONSTRAINT = 'asset_embeddings_revive_count_bounded';
    END IF;

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
