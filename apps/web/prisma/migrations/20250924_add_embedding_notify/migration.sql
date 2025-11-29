-- Add status tracking columns to asset_embeddings
ALTER TABLE "asset_embeddings"
ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "error" TEXT,
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "embeddingVector" vector;

-- Update existing rows to have proper status
UPDATE "asset_embeddings"
SET "status" = CASE
  WHEN "image_embedding" IS NOT NULL THEN 'ready'
  ELSE 'pending'
END
WHERE "status" IS NULL;

-- Create notification function for embedding completion
CREATE OR REPLACE FUNCTION notify_embedding_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify on actual completion (not intermediate states)
  IF (NEW.status = 'ready' AND OLD.status != 'ready') OR
     (NEW.image_embedding IS NOT NULL AND OLD.image_embedding IS NULL) THEN
    PERFORM pg_notify(
      'embedding_complete',
      json_build_object(
        'assetId', NEW.asset_id,
        'status', 'ready',
        'modelName', NEW.model_name,
        'modelVersion', NEW.model_version,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      )::text
    );
  -- Notify on processing start
  ELSIF NEW.status = 'processing' AND OLD.status != 'processing' THEN
    PERFORM pg_notify(
      'embedding_processing',
      json_build_object(
        'assetId', NEW.asset_id,
        'status', 'processing',
        'modelName', NEW.model_name,
        'modelVersion', NEW.model_version,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      )::text
    );
  -- Notify on failure
  ELSIF NEW.status = 'failed' AND OLD.status != 'failed' THEN
    PERFORM pg_notify(
      'embedding_failed',
      json_build_object(
        'assetId', NEW.asset_id,
        'status', 'failed',
        'error', NEW.error,
        'modelName', NEW.model_name,
        'modelVersion', NEW.model_version,
        'timestamp', EXTRACT(EPOCH FROM NOW())
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for embedding status changes
CREATE TRIGGER embedding_completion_trigger
AFTER INSERT OR UPDATE ON "asset_embeddings"
FOR EACH ROW
EXECUTE FUNCTION notify_embedding_complete();

-- Create index for fast lookups on completed embeddings
CREATE INDEX IF NOT EXISTS idx_asset_embeddings_asset_id_status
ON "asset_embeddings"("asset_id", "status")
WHERE "status" = 'ready';

-- Create index for finding pending embeddings
CREATE INDEX IF NOT EXISTS idx_asset_embeddings_pending
ON "asset_embeddings"("createdAt")
WHERE "status" = 'pending';

-- Create index for finding failed embeddings
CREATE INDEX IF NOT EXISTS idx_asset_embeddings_failed
ON "asset_embeddings"("updatedAt")
WHERE "status" = 'failed';

-- Grant necessary permissions for LISTEN/NOTIFY
-- Note: This assumes the database user has appropriate permissions
-- If not, run as superuser: GRANT USAGE ON SCHEMA public TO your_user;