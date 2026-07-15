-- Fence recovery probes with a unique lease token. This is additive so older
-- binaries can continue to read the circuit while the new boundary rolls out.
ALTER TABLE "embedding_provider_circuits"
  ADD COLUMN IF NOT EXISTS "probe_lease_token" TEXT;
