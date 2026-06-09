CREATE TABLE "user_identities" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_subject" TEXT NOT NULL,
  "email" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_provider_subject" ON "user_identities"("provider", "provider_subject");
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

ALTER TABLE "user_identities"
  ADD CONSTRAINT "user_identities_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

INSERT INTO "user_identities" ("id", "user_id", "provider", "provider_subject", "email", "updated_at")
SELECT
  'uid_' || md5("id"),
  "id",
  'clerk',
  "id",
  "email",
  CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("provider", "provider_subject") DO NOTHING;
