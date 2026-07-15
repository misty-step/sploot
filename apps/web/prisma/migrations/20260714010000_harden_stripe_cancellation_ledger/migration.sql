-- Runtime-safe portion of the ledger hardening. Privileged ownership, the
-- append function, grants, and maintenance purge authority are installed by
-- prisma/stripe-ledger-bootstrap-post.sql after migrations under a restricted
-- role (see also stripe-ledger-bootstrap-pre.sql).
CREATE TABLE "stripe_cancellation_deliveries" (
  "delivery_key" TEXT NOT NULL,
  "alert_key" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claim_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stripe_cancellation_deliveries_pkey" PRIMARY KEY ("delivery_key")
);

CREATE UNIQUE INDEX "stripe_cancellation_deliveries_alert_key_adapter_key"
  ON "stripe_cancellation_deliveries"("alert_key", "adapter");
CREATE INDEX "stripe_cancellation_deliveries_alert_key_status_lease_expires_at_idx"
  ON "stripe_cancellation_deliveries"("alert_key", "status", "lease_expires_at");
