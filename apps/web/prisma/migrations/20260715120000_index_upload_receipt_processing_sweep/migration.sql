-- Supports the bounded processing-receipt sweeper without scanning completed
-- replay receipts or active processing rows.
BEGIN;
CREATE INDEX "upload_idempotency_status_lease_expires_at_idx"
  ON "upload_idempotency"("status", "lease_expires_at");

COMMIT;
