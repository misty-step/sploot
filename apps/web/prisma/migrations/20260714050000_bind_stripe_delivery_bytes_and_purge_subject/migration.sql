-- 1) Exact-byte delivery authority. The digest sent as X-Sploot-Payload-Digest
--    must cover the exact serialized HTTP body bytes that are sent, including
--    the adapter wrapper ({"action":"open","reason":...,"alert":...} /
--    {"action":"page","alert":...}), not just the inner alert payload. The
--    canonical bytes are authored once, persisted in "payload_bytes", and the
--    HTTP client sends them verbatim so retries are byte-identical.
ALTER TABLE "stripe_cancellation_deliveries"
  ADD COLUMN IF NOT EXISTS "payload_bytes" TEXT;

-- Rolling databases: rows written under the alert-payload digest contract are
-- rebuilt into the wrapper contract deterministically. Rows already delivered
-- keep their history; undelivered rows become deliverable under the exact-byte
-- contract. In-flight claims are fenced out by the digest change and will
-- re-claim cleanly after lease expiry.
UPDATE "stripe_cancellation_deliveries"
SET
  "payload" = CASE
    WHEN "adapter" = 'circuit' THEN jsonb_build_object(
      'action', 'open',
      'reason', 'stripe subscription cancellation rate exceeded',
      'alert', CASE WHEN "payload" ? 'alert' THEN "payload"->'alert' ELSE "payload" END
    )
    ELSE jsonb_build_object(
      'action', 'page',
      'alert', CASE WHEN "payload" ? 'alert' THEN "payload"->'alert' ELSE "payload" END
    )
  END
WHERE "payload_bytes" IS NULL;

UPDATE "stripe_cancellation_deliveries"
SET
  "payload_bytes" = "payload"::text,
  "payload_digest" = encode(digest("payload"::text, 'sha256'), 'hex'),
  "payload_version" = 'stripe-cancellation-http-v1'
WHERE "payload_bytes" IS NULL;

ALTER TABLE "stripe_cancellation_deliveries"
  ALTER COLUMN "payload_bytes" SET NOT NULL;

-- 2) Subject-bound maintenance tokens. A purge authority is scoped to exactly
--    one subject (a Stripe account or a Stripe object id) in addition to the
--    time range and legal cutoff, so deleting one tenant's rows can never
--    purge another tenant's rows in the same time range.
ALTER TABLE "stripe_cancellation_maintenance_tokens"
  ADD COLUMN IF NOT EXISTS "subject_kind" TEXT,
  ADD COLUMN IF NOT EXISTS "subject_id" TEXT,
  ADD COLUMN IF NOT EXISTS "time_basis" TEXT;

-- Fail closed on tokens issued before subject binding existed: they carry no
-- subject authority, so they are revoked (consumed) rather than widened.
UPDATE "stripe_cancellation_maintenance_tokens"
SET
  "subject_kind" = COALESCE("subject_kind", 'invalid:legacy'),
  "subject_id" = COALESCE("subject_id", 'invalid:legacy'),
  "time_basis" = COALESCE("time_basis", 'invalid:legacy'),
  "consumed_at" = COALESCE("consumed_at", CURRENT_TIMESTAMP)
WHERE "subject_kind" IS NULL OR "subject_id" IS NULL OR "time_basis" IS NULL;

ALTER TABLE "stripe_cancellation_maintenance_tokens"
  ALTER COLUMN "subject_kind" SET NOT NULL,
  ALTER COLUMN "subject_id" SET NOT NULL,
  ALTER COLUMN "time_basis" SET NOT NULL;
