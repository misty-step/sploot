-- Durable embedding retry state and provider admission backoff.
-- Additive so an application rollback can continue to read existing rows.
BEGIN;

ALTER TABLE "asset_embeddings"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminal_at" TIMESTAMP(3);

-- The pending-attempt index is created concurrently by the repo-owned
-- migrate-deploy runner after this explicit transaction commits. Keeping the
-- concurrent build in that separate autocommit stage preserves online writes.

CREATE TABLE IF NOT EXISTS "embedding_provider_circuits" (
  "key" TEXT NOT NULL,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "generation" INTEGER NOT NULL DEFAULT 0,
  "open_until" TIMESTAMP(3),
  "probe_until" TIMESTAMP(3),
  "probe_generation" INTEGER,
  "last_reason" TEXT,
  "last_failure_at" TIMESTAMP(3),
  "last_alerted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "embedding_provider_circuits_pkey" PRIMARY KEY ("key")
);

-- Keep upgrades from the first draft additive and rollback-compatible.
ALTER TABLE "embedding_provider_circuits"
  ADD COLUMN IF NOT EXISTS "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "probe_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "probe_generation" INTEGER;

CREATE INDEX IF NOT EXISTS "embedding_provider_circuits_open_until_idx"
  ON "embedding_provider_circuits"("open_until");

COMMIT;
