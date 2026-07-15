-- Add only data structures here. The restricted application migration role
-- must not create roles, alter ownership, or receive direct event/audit DML.
ALTER TABLE "stripe_cancellation_events"
  ADD COLUMN "raw_body_digest" TEXT,
  ADD COLUMN "raw_payload" JSONB,
  ADD COLUMN "livemode" BOOLEAN,
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "object_id" TEXT,
  ADD COLUMN "object_type" TEXT,
  ADD COLUMN "signature_timestamp" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "stripe_cancellation_events"
    WHERE "raw_body_digest" IS NULL OR "raw_payload" IS NULL OR "livemode" IS NULL
       OR "object_id" IS NULL OR "object_type" IS NULL OR "signature_timestamp" IS NULL
  ) THEN
    RAISE EXCEPTION 'existing Stripe ledger events lack authenticated raw-payload provenance; privileged migration required';
  END IF;
END
$$;

ALTER TABLE "stripe_cancellation_events"
  ALTER COLUMN "raw_body_digest" SET NOT NULL,
  ALTER COLUMN "raw_payload" SET NOT NULL,
  ALTER COLUMN "livemode" SET NOT NULL,
  ALTER COLUMN "object_id" SET NOT NULL,
  ALTER COLUMN "object_type" SET NOT NULL,
  ALTER COLUMN "signature_timestamp" SET NOT NULL;

ALTER TABLE "stripe_cancellation_deliveries"
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dead_lettered_at" TIMESTAMP(3);

CREATE TABLE "stripe_cancellation_maintenance" (
  "id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "range_start" TIMESTAMP(3),
  "range_end" TIMESTAMP(3),
  "purged_count" INTEGER NOT NULL,
  "purged_digest" TEXT NOT NULL,
  "previous_record_digest" TEXT,
  "record_digest" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stripe_cancellation_maintenance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stripe_cancellation_maintenance_created_at_idx"
  ON "stripe_cancellation_maintenance"("created_at");
