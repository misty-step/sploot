-- Add generation-matched recovery leases without rewriting the original
-- resilience migration. Existing binaries can continue to read the circuit
-- row while this additive migration is applied.
BEGIN;
ALTER TABLE "embedding_provider_circuits"
  ADD COLUMN IF NOT EXISTS "generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "probe_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "probe_generation" INTEGER;
COMMIT;
