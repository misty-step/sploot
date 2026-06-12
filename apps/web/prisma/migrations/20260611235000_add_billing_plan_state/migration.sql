-- Add per-user billing plan state for storage-based pricing.
-- Stripe remains the source of subscription/payment truth; these columns are
-- the local authorization cache used by quota enforcement and settings UI.

ALTER TABLE "users"
  ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "stripe_customer_id" TEXT,
  ADD COLUMN "stripe_subscription_id" TEXT,
  ADD COLUMN "stripe_price_id" TEXT,
  ADD COLUMN "billing_status" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "billing_current_period_end" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_stripe_customer_id_key"
  ON "users"("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;

CREATE UNIQUE INDEX "users_stripe_subscription_id_key"
  ON "users"("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;

CREATE INDEX "users_plan_idx" ON "users"("plan");
