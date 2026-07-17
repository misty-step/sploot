ALTER TABLE "library_exports" DROP CONSTRAINT IF EXISTS "library_exports_manifest_finalized_artifact_size_check";
ALTER TABLE "library_exports" ADD CONSTRAINT "library_exports_manifest_finalized_artifact_size_check" CHECK ("manifest_finalized_artifact" IS NULL OR octet_length("manifest_finalized_artifact") <= 16777216);
