-- Align the versioned schema with the active CLIP embedding width.
-- Production was already altered out-of-band to vector(768), so this migration
-- guards on pgvector's typmod and is a no-op there. Fresh or stale empty
-- databases that still have vector(512) are corrected through migrate deploy.
DO $$
DECLARE
  current_dimensions INTEGER;
  non_null_embedding_count INTEGER;
BEGIN
  SELECT NULLIF(a.atttypmod, -1)
  INTO current_dimensions
  FROM pg_attribute a
  INNER JOIN pg_class c ON c.oid = a.attrelid
  INNER JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname = 'asset_embeddings'
    AND a.attname = 'image_embedding'
    AND NOT a.attisdropped;

  IF current_dimensions IS NULL THEN
    RAISE EXCEPTION 'asset_embeddings.image_embedding column not found';
  ELSIF current_dimensions <> 768 THEN
    SELECT COUNT(*)
    INTO non_null_embedding_count
    FROM "asset_embeddings"
    WHERE "image_embedding" IS NOT NULL;

    IF non_null_embedding_count > 0 THEN
      RAISE EXCEPTION
        'Cannot automatically convert % existing image embeddings from vector(%) to vector(768); re-embed or backfill explicitly before this migration.',
        non_null_embedding_count,
        current_dimensions;
    END IF;

    -- The canonical migration history already dropped asset_embeddings_hnsw_idx
    -- in 20260610195422_add_text_embedding_cache, so there is no index to
    -- recreate in the final schema. This drop only unblocks stale partial DBs.
    DROP INDEX IF EXISTS "asset_embeddings_hnsw_idx";
    ALTER TABLE "asset_embeddings"
      ALTER COLUMN "image_embedding" TYPE vector(768)
      USING "image_embedding"::vector(768);
  END IF;
END $$;
