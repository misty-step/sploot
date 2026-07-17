ALTER TABLE "library_exports" ADD COLUMN "manifest_finalized_at" TIMESTAMP(3);
ALTER TABLE "library_exports" ADD COLUMN "manifest_finalized_summary" JSONB;
ALTER TABLE "library_exports" DROP CONSTRAINT IF EXISTS "library_exports_manifest_finalized_summary_size_check";
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_manifest_finalized_summary_size_check" CHECK ("manifest_finalized_summary" IS NULL OR pg_column_size("manifest_finalized_summary") <= 4194304);
ALTER TABLE "library_exports" DROP CONSTRAINT IF EXISTS "library_exports_status_check";
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_status_check" CHECK ("status" IN ('active', 'complete', 'superseded', 'canceled'));
ALTER TABLE "library_exports" ADD COLUMN "manifest_finalized_artifact" TEXT;
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_manifest_finalized_artifact_size_check" CHECK ("manifest_finalized_artifact" IS NULL OR octet_length("manifest_finalized_artifact") <= 4194304);
