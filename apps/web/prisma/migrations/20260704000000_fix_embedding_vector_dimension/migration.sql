-- Align the versioned schema with the active CLIP embedding width.
-- Production may still carry an unbounded `vector` column even when every
-- stored value is 768-dimensional. Distinguish that state from a missing
-- column, prove the existing rows are compatible, and only then constrain it.
-- Fresh or stale empty databases with another bounded width are also repaired.
DO $$
DECLARE
  current_typmod INTEGER;
  incompatible_embedding_count BIGINT;
  non_null_embedding_count BIGINT;
BEGIN
  SELECT a.atttypmod
  INTO current_typmod
  FROM pg_attribute a
  INNER JOIN pg_class c ON c.oid = a.attrelid
  INNER JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname = 'asset_embeddings'
    AND a.attname = 'image_embedding'
    AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset_embeddings.image_embedding column not found';
  ELSIF current_typmod = -1 THEN
    -- Unbounded `vector` columns may already contain correctly-sized data.
    -- Prove every existing row is compatible before constraining the typmod.
    SELECT COUNT(*)
    INTO incompatible_embedding_count
    FROM "asset_embeddings"
    WHERE "image_embedding" IS NOT NULL
      AND vector_dims("image_embedding") <> 768;

    IF incompatible_embedding_count > 0 THEN
      RAISE EXCEPTION
        'Cannot constrain image_embedding to vector(768): % existing embeddings have a different dimension.',
        incompatible_embedding_count;
    END IF;

    DROP INDEX IF EXISTS "asset_embeddings_hnsw_idx";
    ALTER TABLE "asset_embeddings"
      ALTER COLUMN "image_embedding" TYPE vector(768)
      USING "image_embedding"::vector(768);
  ELSIF current_typmod <> 768 THEN
    SELECT COUNT(*)
    INTO non_null_embedding_count
    FROM "asset_embeddings"
    WHERE "image_embedding" IS NOT NULL;

    IF non_null_embedding_count > 0 THEN
      RAISE EXCEPTION
        'Cannot automatically convert % existing image embeddings from vector(%) to vector(768); re-embed or backfill explicitly before this migration.',
        non_null_embedding_count,
        current_typmod;
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
