-- Durable counters for the cost admission kernel (apps/web/lib/cost/).
-- Generalizes embedding_rate_buckets to any capability key so per-account
-- daily/monthly inference budgets can be tracked and enforced. Additive;
-- may remain after an application rollback. Expired rows are pruned by the
-- admission transaction itself.

CREATE TABLE "cost_admission_counters" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cost_admission_counters_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "cost_admission_counters_expires_at_idx"
  ON "cost_admission_counters"("expires_at");
