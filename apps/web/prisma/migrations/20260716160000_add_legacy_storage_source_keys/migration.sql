ALTER TABLE "assets"
  ADD COLUMN "storage_source_key" TEXT,
  ADD COLUMN "thumbnail_storage_source_key" TEXT;

COMMENT ON COLUMN "assets"."storage_source_key" IS 'Raw legacy provider key retained while storage_key is the canonical target logical key.';
COMMENT ON COLUMN "assets"."thumbnail_storage_source_key" IS 'Raw legacy thumbnail key retained while thumbnail_storage_key is the canonical target logical key.';
