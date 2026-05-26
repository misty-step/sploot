ALTER TABLE "assets"
ADD COLUMN "shuffle_key" BIGINT;

ALTER TABLE "assets"
ALTER COLUMN "shuffle_key" SET DEFAULT floor((random() * 9223372036854775807::double precision))::bigint;

UPDATE "assets"
SET "shuffle_key" = DEFAULT
WHERE "shuffle_key" IS NULL;

ALTER TABLE "assets"
ALTER COLUMN "shuffle_key" SET NOT NULL;

CREATE INDEX "assets_owner_live_shuffle_key_id_idx"
ON "assets"("owner_user_id", "shuffle_key", "id")
WHERE "deleted_at" IS NULL;

CREATE INDEX "assets_owner_live_favorite_shuffle_key_id_idx"
ON "assets"("owner_user_id", "favorite", "shuffle_key", "id")
WHERE "deleted_at" IS NULL;
