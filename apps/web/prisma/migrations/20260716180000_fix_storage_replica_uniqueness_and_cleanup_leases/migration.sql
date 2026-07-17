-- Provider pairs share an asset/rendition/generation; cleanup claims are fenced by owner/token.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP INDEX IF EXISTS "asset_storage_replicas_asset_id_rendition_generation_key";
CREATE UNIQUE INDEX IF NOT EXISTS "asset_storage_replicas_asset_id_rendition_generation_provider_key"
  ON "asset_storage_replicas"("asset_id", "rendition", "generation", "provider");

ALTER TABLE "storage_migration_entries"
  ADD COLUMN IF NOT EXISTS "rendition" TEXT NOT NULL DEFAULT 'original';
-- Older inventories predate the rendition column. Their thumbnail logical
-- keys were already written back to assets.thumbnail_storage_key, so recover
-- that immutable identity before resumptions validate the manifest.
UPDATE "storage_migration_entries" AS entry
SET "rendition" = 'thumbnail'
FROM "assets" AS asset
WHERE entry."rendition" = 'original'
  AND entry."logical_key" = asset."thumbnail_storage_key"
  AND (asset."storage_key" IS NULL OR asset."storage_key" <> entry."logical_key");
ALTER TABLE "storage_cleanup_outbox"
  ADD COLUMN IF NOT EXISTS "claim_owner" TEXT;
ALTER TABLE "storage_cleanup_outbox"
  ADD COLUMN IF NOT EXISTS "claim_token" TEXT;

CREATE INDEX IF NOT EXISTS "storage_cleanup_outbox_claim_idx"
  ON "storage_cleanup_outbox"("status", "available_at", "claim_owner", "claim_token");

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sploot_stripe_app') THEN
    REVOKE ALL ON TABLE public.asset_storage_replicas FROM sploot_stripe_app;
  END IF;
END $$;
COMMIT;
