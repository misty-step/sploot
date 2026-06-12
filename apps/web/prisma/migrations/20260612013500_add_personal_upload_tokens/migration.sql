CREATE TABLE "personal_upload_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "personal_upload_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personal_upload_tokens_token_hash_key" ON "personal_upload_tokens"("token_hash");
CREATE INDEX "personal_upload_tokens_user_id_revoked_at_idx" ON "personal_upload_tokens"("user_id", "revoked_at");

ALTER TABLE "personal_upload_tokens"
  ADD CONSTRAINT "personal_upload_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
