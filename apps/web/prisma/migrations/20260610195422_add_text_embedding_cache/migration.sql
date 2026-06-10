-- DropIndex
DROP INDEX "asset_embeddings_hnsw_idx";

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

-- CreateIndex
CREATE INDEX "asset_embeddings_status_createdAt_idx" ON "asset_embeddings"("status", "createdAt");

-- RenameIndex
ALTER INDEX "unique_user_checksum" RENAME TO "assets_owner_user_id_checksum_sha256_key";

-- RenameIndex
ALTER INDEX "unique_user_tag" RENAME TO "tags_owner_user_id_name_key";

-- RenameIndex
ALTER INDEX "unique_provider_subject" RENAME TO "user_identities_provider_provider_subject_key";
