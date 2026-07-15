-- Keep the embedding attempt-count ceiling fail-closed even if the application
-- is rolled back to a runtime whose in-code limits are higher or incomplete.
-- These limits come from the current provider-rate model; they are not durable
-- provider-dollar enforcement. Existing over-ceiling attempt counters are
-- clamped to the ceiling (never reset), so migration leaves the affected
-- window denied rather than granting capacity.
BEGIN;

UPDATE "embedding_rate_buckets"
SET "count" = 684
WHERE "key" LIKE 'embedding:daily:%'
  AND "count" > 684;

UPDATE "embedding_rate_buckets"
SET "count" = 20547
WHERE "key" LIKE 'embedding:monthly:%'
  AND "count" > 20547;

ALTER TABLE "embedding_rate_buckets"
  ADD CONSTRAINT "embedding_attempt_count_ceiling"
  CHECK (
    ("key" NOT LIKE 'embedding:daily:%' OR "count" <= 684)
    AND ("key" NOT LIKE 'embedding:monthly:%' OR "count" <= 20547)
  ) NOT VALID;

ALTER TABLE "embedding_rate_buckets"
  VALIDATE CONSTRAINT "embedding_attempt_count_ceiling";

COMMIT;
