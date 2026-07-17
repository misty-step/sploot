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
    "manifest_metadata_bytes" BIGINT NOT NULL DEFAULT 0,
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

-- Source validation is authoritative; these NOT VALID checks reject new oversized
-- rows without making this migration fail on legacy data that predates the bounds.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_id_length_check" CHECK (char_length("id") <= 128) NOT VALID;
ALTER TABLE "tags"
  ADD CONSTRAINT "tags_name_length_check" CHECK (char_length("name") <= 128) NOT VALID,
  ADD CONSTRAINT "tags_color_length_check" CHECK ("color" IS NULL OR char_length("color") <= 32) NOT VALID;
ALTER TABLE "library_exports"
  ADD CONSTRAINT "library_exports_total_assets_check" CHECK ("total_assets" >= 0) NOT VALID,
  ADD CONSTRAINT "library_exports_part_boundaries_json_check" CHECK (
    CASE WHEN jsonb_typeof("part_boundaries") = 'array'
      THEN jsonb_array_length("part_boundaries") <= 10000
      ELSE false END
  ) NOT VALID,
  ADD CONSTRAINT "library_exports_served_parts_json_check" CHECK (
    CASE WHEN jsonb_typeof("served_parts") = 'array'
      THEN jsonb_array_length("served_parts") <= 10000
      ELSE false END
  ) NOT VALID;
