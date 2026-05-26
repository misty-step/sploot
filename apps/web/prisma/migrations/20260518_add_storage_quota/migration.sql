-- Add per-user storage quotas and short-lived reservations used to make
-- quota checks deterministic under concurrent uploads.

CREATE TABLE "user_storage_quotas" (
  "user_id" TEXT NOT NULL,
  "limit_bytes" BIGINT NOT NULL DEFAULT 1073741824,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_storage_quotas_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_storage_quotas_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "storage_quota_reservations" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "bytes" BIGINT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "storage_quota_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storage_quota_reservations_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "storage_quota_reservations_owner_user_id_expires_at_idx"
  ON "storage_quota_reservations"("owner_user_id", "expires_at");

INSERT INTO "user_storage_quotas" ("user_id", "limit_bytes")
SELECT "id", 1073741824
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;
