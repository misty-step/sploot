-- Add check constraint to validate blob URL format
-- Ensures blobUrl follows Vercel Blob Storage pattern: https://*.public.blob.vercel-storage.com/*

-- Add constraint to assets table
ALTER TABLE "assets"
ADD CONSTRAINT "assets_blob_url_format_check"
CHECK (
  "blob_url" ~ '^https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/.+$'
);

-- Add constraint to assets table for thumbnail URLs (optional field)
ALTER TABLE "assets"
ADD CONSTRAINT "assets_thumbnail_url_format_check"
CHECK (
  "thumbnail_url" IS NULL OR
  "thumbnail_url" ~ '^https://[a-z0-9-]+\.public\.blob\.vercel-storage\.com/.+$'
);

-- Comment the constraints for documentation
COMMENT ON CONSTRAINT "assets_blob_url_format_check" ON "assets"
IS 'Validates that blob_url follows Vercel Blob Storage URL pattern';

COMMENT ON CONSTRAINT "assets_thumbnail_url_format_check" ON "assets"
IS 'Validates that thumbnail_url follows Vercel Blob Storage URL pattern if set';