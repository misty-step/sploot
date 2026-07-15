CREATE TABLE "upload_idempotency" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "lease_token" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_idempotency_owner_key_key"
  ON "upload_idempotency"("owner_user_id", "key");
CREATE INDEX "upload_idempotency_lease_expires_at_idx"
  ON "upload_idempotency"("lease_expires_at");

ALTER TABLE "upload_idempotency"
  ADD CONSTRAINT "upload_idempotency_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
