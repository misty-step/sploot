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
    old_names TEXT[] := ARRAY[
        'unique_user_checksum',
        'unique_user_tag',
        'unique_provider_subject'
    ];
    target_names TEXT[] := ARRAY[
        'assets_owner_user_id_checksum_sha256_key',
        'tags_owner_user_id_name_key',
        'user_identities_provider_provider_subject_key'
    ];
    table_names TEXT[] := ARRAY['assets', 'tags', 'user_identities'];
    column_definitions TEXT[] := ARRAY[
        'owner_user_id, checksum_sha256',
        'owner_user_id, name',
        'provider, provider_subject'
    ];
    position INTEGER;
    old_definition TEXT;
    target_definition TEXT;
    expected_old_definition TEXT;
    expected_target_definition TEXT;
BEGIN
    FOR position IN 1..array_length(old_names, 1) LOOP
        old_definition := NULL;
        target_definition := NULL;

        SELECT pg_get_indexdef(c.oid)
        INTO old_definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = old_names[position];

        SELECT pg_get_indexdef(c.oid)
        INTO target_definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind = 'i'
          AND c.relname = target_names[position];

        expected_old_definition := format(
            'CREATE UNIQUE INDEX %I ON %I.%I USING btree (%s)',
            old_names[position],
            current_schema(),
            table_names[position],
            column_definitions[position]
        );
        expected_target_definition := format(
            'CREATE UNIQUE INDEX %I ON %I.%I USING btree (%s)',
            target_names[position],
            current_schema(),
            table_names[position],
            column_definitions[position]
        );

        IF old_definition IS NOT NULL AND target_definition IS NOT NULL THEN
            RAISE EXCEPTION
                'Both source % and target % indexes exist',
                old_names[position],
                target_names[position];
        ELSIF target_definition IS NOT NULL THEN
            IF target_definition <> expected_target_definition THEN
                RAISE EXCEPTION
                    'Existing target index % is incompatible: %',
                    target_names[position],
                    target_definition;
            END IF;
        ELSE
            IF old_definition IS NULL THEN
                RAISE EXCEPTION
                    'Neither source % nor target % index exists',
                    old_names[position],
                    target_names[position];
            ELSIF old_definition <> expected_old_definition THEN
                RAISE EXCEPTION
                    'Existing source index % is incompatible: %',
                    old_names[position],
                    old_definition;
            END IF;

            EXECUTE format(
                'ALTER INDEX %I RENAME TO %I',
                old_names[position],
                target_names[position]
            );
        END IF;
    END LOOP;
END $$;

COMMIT;
