-- This migration first reached production after several of its schema changes
-- had already been applied out of band. Guard only those known pre-applied
-- operations so `migrate resolve --rolled-back` can safely replay them; keep
-- genuinely absent objects as plain CREATEs so incompatible partial state fails.
BEGIN;

-- DropIndex
DROP INDEX IF EXISTS "asset_embeddings_hnsw_idx";

-- AlterTable
ALTER TABLE "asset_embeddings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "shuffle_key" SET DEFAULT floor((random() * 9223372036854775807::double precision))::bigint;

-- AlterTable
ALTER TABLE "tags" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_storage_quotas" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "text_embedding_cache" (
    "key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "text_embedding_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "text_embedding_cache_expires_at_idx" ON "text_embedding_cache"("expires_at");

-- CreateIndex. Production already has this exact index from an out-of-band
-- schema sync; reject any same-named but incompatible object.
DO $$
DECLARE
    existing_index_definition TEXT;
    expected_index_definition TEXT := format(
        'CREATE INDEX %I ON %I.%I USING btree (status, "createdAt")',
        'asset_embeddings_status_createdAt_idx',
        current_schema(),
        'asset_embeddings'
    );
BEGIN
    SELECT indexdef
    INTO existing_index_definition
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'asset_embeddings'
      AND indexname = 'asset_embeddings_status_createdAt_idx';

    IF existing_index_definition IS NULL THEN
        CREATE INDEX "asset_embeddings_status_createdAt_idx"
            ON "asset_embeddings"("status", "createdAt");
    ELSIF existing_index_definition <> expected_index_definition THEN
        RAISE EXCEPTION
            'Existing asset_embeddings_status_createdAt_idx is incompatible: %',
            existing_index_definition;
    END IF;
END $$;

-- RenameIndex
DO $$
DECLARE
    old_exists BOOLEAN;
    target_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'unique_user_checksum'
    ) INTO old_exists;
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'assets_owner_user_id_checksum_sha256_key'
    ) INTO target_exists;

    IF old_exists AND target_exists THEN
        RAISE EXCEPTION 'Both source and target checksum indexes exist';
    ELSIF NOT target_exists THEN
        ALTER INDEX "unique_user_checksum"
            RENAME TO "assets_owner_user_id_checksum_sha256_key";
    END IF;
END $$;

-- RenameIndex
DO $$
DECLARE
    old_exists BOOLEAN;
    target_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'unique_user_tag'
    ) INTO old_exists;
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'tags_owner_user_id_name_key'
    ) INTO target_exists;

    IF old_exists AND target_exists THEN
        RAISE EXCEPTION 'Both source and target tag indexes exist';
    ELSIF NOT target_exists THEN
        ALTER INDEX "unique_user_tag"
            RENAME TO "tags_owner_user_id_name_key";
    END IF;
END $$;

-- RenameIndex
DO $$
DECLARE
    old_exists BOOLEAN;
    target_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'unique_provider_subject'
    ) INTO old_exists;
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = 'user_identities_provider_provider_subject_key'
    ) INTO target_exists;

    IF old_exists AND target_exists THEN
        RAISE EXCEPTION 'Both source and target provider indexes exist';
    ELSIF NOT target_exists THEN
        ALTER INDEX "unique_provider_subject"
            RENAME TO "user_identities_provider_provider_subject_key";
    END IF;
END $$;

COMMIT;
