-- Add the owner/live projection without scanning or locking the existing
-- embedding population. A later resumable backfill and a timeout-bounded
-- enforcement migration complete the contract.

BEGIN;

ALTER TABLE "asset_embeddings"
  ADD COLUMN "owner_user_id" TEXT,
  ADD COLUMN "asset_deleted_at" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION "sploot_sync_asset_embedding_visibility"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  asset_owner TEXT;
  asset_deleted TIMESTAMP(3);
BEGIN
  SELECT "owner_user_id", "deleted_at"
  INTO asset_owner, asset_deleted
  FROM "assets"
  WHERE "id" = NEW."asset_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'asset_embeddings visibility projection requires an existing asset: %',
      NEW."asset_id";
  END IF;

  NEW."owner_user_id" := asset_owner;
  NEW."asset_deleted_at" := asset_deleted;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "asset_embeddings_sync_visibility" ON "asset_embeddings";
CREATE TRIGGER "asset_embeddings_sync_visibility"
BEFORE INSERT OR UPDATE ON "asset_embeddings"
FOR EACH ROW
EXECUTE FUNCTION "sploot_sync_asset_embedding_visibility"();

CREATE OR REPLACE FUNCTION "sploot_propagate_asset_embedding_visibility"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."owner_user_id" IS DISTINCT FROM NEW."owner_user_id"
     OR OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at" THEN
    UPDATE "asset_embeddings"
    SET
      "owner_user_id" = NEW."owner_user_id",
      "asset_deleted_at" = NEW."deleted_at"
    WHERE "asset_id" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "assets_propagate_embedding_visibility" ON "assets";
CREATE TRIGGER "assets_propagate_embedding_visibility"
AFTER UPDATE OF "owner_user_id", "deleted_at" ON "assets"
FOR EACH ROW
EXECUTE FUNCTION "sploot_propagate_asset_embedding_visibility"();

COMMIT;
