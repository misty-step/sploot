-- Provider-neutral identity is authoritative for future writes. Legacy URLs
-- remain readable during shadow/cutover/rollback and are not provider policy.
BEGIN;
ALTER TABLE "assets"
  ADD COLUMN "storage_provider" TEXT NOT NULL DEFAULT 'vercel',
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "thumbnail_storage_key" TEXT,
  ADD COLUMN "storage_config_fingerprint" TEXT,
  ADD COLUMN "storage_size" INTEGER,
  ADD COLUMN "storage_sha256" TEXT,
  ADD COLUMN "thumbnail_storage_size" INTEGER,
  ADD COLUMN "thumbnail_storage_sha256" TEXT;

UPDATE "assets" SET "storage_key" = "pathname" WHERE "storage_key" IS NULL;

CREATE TABLE "storage_migration_entries" (
  "id" TEXT NOT NULL,
  "logical_key" TEXT NOT NULL,
  "source_provider" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "target_provider" TEXT NOT NULL,
  "target_key" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "content_type" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_generation" INTEGER NOT NULL DEFAULT 0,
  "worker_id" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "last_error" TEXT,
  "verified_at" TIMESTAMP(3),
  "rolled_back_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_migration_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storage_migration_entries_logical_key_key" ON "storage_migration_entries"("logical_key");
CREATE INDEX "storage_migration_entries_claim_idx" ON "storage_migration_entries"("status", "lease_expires_at", "logical_key");

CREATE TABLE "storage_cutover_state" (
  "id" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 0,
  "provider_fingerprint" TEXT NOT NULL,
  "manifest_sha256" TEXT,
  "verified_at" TIMESTAMP(3),
  "rollback_at" TIMESTAMP(3),
  "legacy_delete_after" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_cutover_state_pkey" PRIMARY KEY ("id")
);

COMMENT ON COLUMN "assets"."storage_provider" IS 'Provider identity, never a credential or public URL authority';
COMMENT ON COLUMN "assets"."storage_key" IS 'Canonical provider-neutral logical key';
COMMIT;
