-- Restricted production-shaped migration. Role creation, ownership transfer,
-- SECURITY DEFINER functions, and grants live only in the privileged
-- pre/post bootstrap scripts.
ALTER TABLE "stripe_cancellation_events"
  ADD COLUMN "raw_body_ciphertext" BYTEA,
  ADD COLUMN "raw_body_nonce" BYTEA,
  ADD COLUMN "raw_body_key_id" TEXT,
  ADD COLUMN "signature_header_digest" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "stripe_cancellation_events"
    WHERE "raw_body_ciphertext" IS NULL OR "raw_body_nonce" IS NULL
       OR "raw_body_key_id" IS NULL OR "signature_header_digest" IS NULL
  ) THEN
    RAISE EXCEPTION 'existing Stripe events lack encrypted exact-byte signature provenance; operator remediation is required before upgrade';
  END IF;
END
$$;

ALTER TABLE "stripe_cancellation_events"
  ALTER COLUMN "raw_body_ciphertext" SET NOT NULL,
  ALTER COLUMN "raw_body_nonce" SET NOT NULL,
  ALTER COLUMN "raw_body_key_id" SET NOT NULL,
  ALTER COLUMN "signature_header_digest" SET NOT NULL;

ALTER TABLE "stripe_cancellation_deliveries"
  ADD COLUMN "replay_key" TEXT,
  ADD COLUMN "payload_digest" TEXT,
  ADD COLUMN "payload_version" TEXT,
  ADD COLUMN "payload" JSONB;

UPDATE "stripe_cancellation_deliveries"
SET "replay_key" = 'stripe-delivery-replay:' || "delivery_key",
    "payload_digest" = encode(digest('legacy-unverified-v0|' || "delivery_key" || '|' || "alert_key" || '|' || "adapter", 'sha256'), 'hex'),
    "payload_version" = 'legacy-unverified-v0',
    "payload" = '{}'::jsonb,
    "status" = 'dead-letter',
    "dead_lettered_at" = COALESCE("dead_lettered_at", CURRENT_TIMESTAMP),
    "last_error" = COALESCE("last_error", 'legacy outbox payload provenance unavailable; operator replay required')
WHERE "replay_key" IS NULL OR "payload_digest" IS NULL OR "payload_version" IS NULL OR "payload" IS NULL;

ALTER TABLE "stripe_cancellation_deliveries"
  ALTER COLUMN "replay_key" SET NOT NULL,
  ALTER COLUMN "payload_digest" SET NOT NULL,
  ALTER COLUMN "payload_version" SET NOT NULL,
  ALTER COLUMN "payload" SET NOT NULL;

CREATE UNIQUE INDEX "stripe_cancellation_deliveries_replay_key_key"
  ON "stripe_cancellation_deliveries"("replay_key");
