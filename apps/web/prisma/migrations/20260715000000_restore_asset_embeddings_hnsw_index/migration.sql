-- Restore the cosine HNSW access path removed by the text-cache and vector
-- dimension migrations. This is intentionally additive: canonical migration
-- history is immutable, and both fresh installs and legacy upgrades must end
-- with the same vector(768) index contract.
DO $$
DECLARE
  existing_definition TEXT;
BEGIN
  SELECT indexdef
  INTO existing_definition
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND tablename = 'asset_embeddings'
    AND indexname = 'asset_embeddings_hnsw_idx';

  IF existing_definition IS NULL THEN
    CREATE INDEX "asset_embeddings_hnsw_idx"
      ON "asset_embeddings"
      USING hnsw ("image_embedding" vector_cosine_ops)
      WITH (m = 24, ef_construction = 128);
  END IF;

  SELECT indexdef
  INTO existing_definition
  FROM pg_indexes
  WHERE schemaname = current_schema()
    AND tablename = 'asset_embeddings'
    AND indexname = 'asset_embeddings_hnsw_idx';

  IF existing_definition IS NULL OR
     existing_definition !~ 'USING hnsw \(image_embedding vector_cosine_ops\)' OR
     existing_definition !~ 'm=''?24''?' OR
     existing_definition !~ 'ef_construction=''?128''?' THEN
    RAISE EXCEPTION
      'asset_embeddings_hnsw_idx has incompatible definition: %',
      existing_definition;
  END IF;
END $$;
