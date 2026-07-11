-- Persist embedding spend and concurrency controls in the existing Postgres
-- database. Both tables are additive and may remain after an application
-- rollback; expired rows are pruned by the limiter transaction.

CREATE TABLE "embedding_rate_buckets" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "embedding_rate_buckets_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "embedding_rate_leases" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "embedding_rate_leases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "embedding_rate_buckets_expires_at_idx"
  ON "embedding_rate_buckets"("expires_at");

CREATE INDEX "embedding_rate_leases_user_id_expires_at_idx"
  ON "embedding_rate_leases"("user_id", "expires_at");

CREATE INDEX "embedding_rate_leases_expires_at_idx"
  ON "embedding_rate_leases"("expires_at");
