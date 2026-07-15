-- A timestamp is not a safe worker-generation fence: the canonical updatedAt
-- trigger has millisecond precision, so two claims can receive the same value.
-- A random token gives every acquired processing generation a unique identity.

ALTER TABLE "asset_embeddings"
  ADD COLUMN "processing_claim_token" TEXT;
