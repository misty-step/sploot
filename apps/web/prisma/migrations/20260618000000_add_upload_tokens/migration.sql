CREATE TABLE "upload_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "upload_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_tokens_token_hash_key" ON "upload_tokens"("token_hash");
CREATE INDEX "upload_tokens_user_id_idx" ON "upload_tokens"("user_id");

ALTER TABLE "upload_tokens"
  ADD CONSTRAINT "upload_tokens_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
