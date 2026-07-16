BEGIN;
CREATE TABLE "asset_storage_replicas" (
  "id" TEXT NOT NULL, "asset_id" TEXT NOT NULL, "rendition" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "source_key" TEXT, "logical_key" TEXT NOT NULL,
  "delivery_url" TEXT NOT NULL, "size" INTEGER NOT NULL, "sha256" TEXT NOT NULL,
  "content_type" TEXT, "generation" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_storage_replicas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_storage_replicas_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "asset_storage_replicas_asset_id_rendition_generation_key" ON "asset_storage_replicas"("asset_id","rendition","generation");
CREATE INDEX "asset_storage_replicas_asset_id_rendition_active_idx" ON "asset_storage_replicas"("asset_id","rendition","active");
CREATE TABLE "storage_cleanup_outbox" (
  "id" TEXT NOT NULL, "asset_id" TEXT, "provider" TEXT NOT NULL, "key" TEXT NOT NULL, "url" TEXT NOT NULL,
  "action" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT, "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_cleanup_outbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "storage_cleanup_outbox_status_available_at_idx" ON "storage_cleanup_outbox"("status","available_at");
COMMIT;