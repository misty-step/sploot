-- Keep the paid-provider ceiling fail-closed even if the application is
-- rolled back to a runtime whose in-code limits are higher or incomplete.
-- Existing over-ceiling counters are clamped to the ceiling (never reset), so
-- migration leaves the affected window denied rather than granting capacity.

UPDATE "embedding_rate_buckets"
SET "count" = 684
WHERE "key" LIKE 'embedding:daily:%'
  AND "count" > 684;

UPDATE "embedding_rate_buckets"
SET "count" = 20547
WHERE "key" LIKE 'embedding:monthly:%'
  AND "count" > 20547;

ALTER TABLE "embedding_rate_buckets"
  ADD CONSTRAINT "embedding_budget_hard_ceiling"
  CHECK (
    ("key" NOT LIKE 'embedding:daily:%' OR "count" <= 684)
    AND ("key" NOT LIKE 'embedding:monthly:%' OR "count" <= 20547)
  ) NOT VALID;

ALTER TABLE "embedding_rate_buckets"
  VALIDATE CONSTRAINT "embedding_budget_hard_ceiling";
