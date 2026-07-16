ALTER TABLE "library_exports"
  DROP CONSTRAINT IF EXISTS "library_exports_status_check";

ALTER TABLE "library_exports"
  ADD CONSTRAINT "library_exports_status_check"
  CHECK ("status" IN ('active', 'finalizing', 'superseded', 'canceled'));
