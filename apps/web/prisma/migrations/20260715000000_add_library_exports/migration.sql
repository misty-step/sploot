-- Complete-library export sessions (Powder card sploot-057).
-- One resumable export session per user at a time; parts are recomputed from
-- the frozen snapshot predicate, so this table stores bookkeeping only.

CREATE TABLE "library_exports" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "manifest_version" TEXT NOT NULL,
    "total_assets" INTEGER NOT NULL,
    "total_original_bytes" BIGINT NOT NULL,
    "part_boundaries" JSONB NOT NULL,
    "served_parts" JSONB NOT NULL DEFAULT '[]',
    "failures" JSONB NOT NULL DEFAULT '{}',
    "egress_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "library_exports_owner_user_id_status_idx"
    ON "library_exports"("owner_user_id", "status");

CREATE INDEX "library_exports_expires_at_idx"
    ON "library_exports"("expires_at");

-- Deterministic admission control: at most one active export session per
-- user. Concurrent creates race on this index; the loser adopts the winner.
CREATE UNIQUE INDEX "library_exports_one_active_per_user"
    ON "library_exports"("owner_user_id")
    WHERE "status" = 'active';

-- Guard rail mirrored in application code (export-service).
ALTER TABLE "library_exports"
    ADD CONSTRAINT "library_exports_status_check"
    CHECK ("status" IN ('active', 'superseded', 'canceled'));

ALTER TABLE "library_exports"
    ADD CONSTRAINT "library_exports_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
