-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Create unique index on email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Create assets table
CREATE TABLE IF NOT EXISTS "assets" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "blob_url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "phash" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- Create indexes on assets
CREATE UNIQUE INDEX "unique_user_checksum" ON "assets"("owner_user_id", "checksum_sha256");
CREATE INDEX "assets_owner_user_id_deleted_at_idx" ON "assets"("owner_user_id", "deleted_at");
CREATE INDEX "assets_createdAt_idx" ON "assets"("createdAt");
CREATE INDEX "assets_favorite_idx" ON "assets"("favorite");

-- Create asset_embeddings table with vector column
CREATE TABLE IF NOT EXISTS "asset_embeddings" (
    "asset_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "image_embedding" vector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_embeddings_pkey" PRIMARY KEY ("asset_id")
);

-- Create indexes on asset_embeddings
CREATE INDEX "asset_embeddings_model_name_model_version_idx" ON "asset_embeddings"("model_name", "model_version");

-- Create HNSW index for vector similarity search
-- Using optimized parameters for high-dimensional embeddings
CREATE INDEX "asset_embeddings_hnsw_idx" ON "asset_embeddings"
USING hnsw ("image_embedding" vector_cosine_ops)
WITH (m = 24, ef_construction = 128);

-- Create tags table
CREATE TABLE IF NOT EXISTS "tags" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- Create indexes on tags
CREATE UNIQUE INDEX "unique_user_tag" ON "tags"("owner_user_id", "name");
CREATE INDEX "tags_owner_user_id_idx" ON "tags"("owner_user_id");

-- Create asset_tags junction table
CREATE TABLE IF NOT EXISTS "asset_tags" (
    "asset_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_tags_pkey" PRIMARY KEY ("asset_id","tag_id")
);

-- Create index on asset_tags
CREATE INDEX "asset_tags_tag_id_idx" ON "asset_tags"("tag_id");

-- Create search_logs table for analytics
CREATE TABLE IF NOT EXISTS "search_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "result_count" INTEGER NOT NULL,
    "query_time" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- Create indexes on search_logs
CREATE INDEX "search_logs_user_id_createdAt_idx" ON "search_logs"("user_id", "createdAt");
CREATE INDEX "search_logs_createdAt_idx" ON "search_logs"("createdAt");

-- Add foreign key constraints
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_embeddings" ADD CONSTRAINT "asset_embeddings_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updatedAt
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON "assets"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_asset_embeddings_updated_at BEFORE UPDATE ON "asset_embeddings"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON "tags"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();