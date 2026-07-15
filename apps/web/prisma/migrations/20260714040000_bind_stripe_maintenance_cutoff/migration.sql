-- Maintenance-token storage is Prisma-owned schema. Earlier bootstrap drafts
-- created this table out-of-band in the privileged post-bootstrap; a fresh
-- database must be able to run `prisma migrate deploy` before any privileged
-- post-bootstrap exists, so the table is created here and the privileged
-- script only asserts, owns, and grants it.
CREATE TABLE IF NOT EXISTS "stripe_cancellation_maintenance_tokens" (
  "token_digest" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "actor" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "range_start" TIMESTAMP(3) NOT NULL,
  "range_end" TIMESTAMP(3) NOT NULL,
  "legal_minimum_since" TIMESTAMP(3) NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "stripe_cancellation_maintenance_tokens_pkey" PRIMARY KEY ("token_digest")
);

-- Rolling databases where an earlier post-bootstrap created the table without
-- the legal-retention cutoff: add and bind it. On a fresh database the column
-- already exists from the CREATE above and these statements are no-ops.
ALTER TABLE "stripe_cancellation_maintenance_tokens"
  ADD COLUMN IF NOT EXISTS "legal_minimum_since" TIMESTAMP(3);

UPDATE "stripe_cancellation_maintenance_tokens"
SET "legal_minimum_since" = COALESCE("legal_minimum_since", "issued_at")
WHERE "legal_minimum_since" IS NULL;

ALTER TABLE "stripe_cancellation_maintenance_tokens"
  ALTER COLUMN "legal_minimum_since" SET NOT NULL;
