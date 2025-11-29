-- Add thumbnail fields to assets table
ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "thumbnail_url" TEXT,
ADD COLUMN IF NOT EXISTS "thumbnail_path" TEXT;