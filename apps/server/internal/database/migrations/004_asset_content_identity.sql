-- A predecessor may have distinct asset identities whose transformed stored
-- bytes coincide. Content deduplication is an ingestion policy, not identity.
-- The migration runner disables FK actions on its dedicated connection while
-- rebuilding, and checks every FK before committing and restoring enforcement.
DROP TRIGGER asset_tags_same_owner_insert;
DROP TRIGGER asset_tags_same_owner_update;

CREATE TABLE assets_rebuilt (
    id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blob_url TEXT NOT NULL,
    thumbnail_url TEXT,
    pathname TEXT NOT NULL,
    thumbnail_path TEXT,
    mime TEXT NOT NULL,
    width INTEGER CHECK (width > 0),
    height INTEGER CHECK (height > 0),
    size INTEGER NOT NULL CHECK (size >= 0),
    checksum_sha256 TEXT NOT NULL,
    storage_size INTEGER CHECK (storage_size >= 0),
    storage_sha256 TEXT,
    thumbnail_storage_size INTEGER CHECK (thumbnail_storage_size >= 0),
    thumbnail_storage_sha256 TEXT,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    share_slug TEXT UNIQUE,
    shuffle_key INTEGER NOT NULL DEFAULT (random() & 9223372036854775807) CHECK (shuffle_key >= 0),
    UNIQUE (id, owner_user_id)
);
INSERT INTO assets_rebuilt SELECT * FROM assets;
DROP TABLE assets;
ALTER TABLE assets_rebuilt RENAME TO assets;
CREATE INDEX assets_owner_created ON assets(owner_user_id, deleted_at, created_at, id);
CREATE INDEX assets_owner_shuffle ON assets(owner_user_id, deleted_at, shuffle_key, id);
CREATE INDEX assets_owner_updated ON assets(owner_user_id, deleted_at, updated_at, id);
CREATE INDEX assets_owner_checksum ON assets(owner_user_id, checksum_sha256, deleted_at, created_at, id);
CREATE TRIGGER assets_immutable_owner BEFORE UPDATE OF owner_user_id ON assets
WHEN NEW.owner_user_id != OLD.owner_user_id
BEGIN SELECT RAISE(ABORT, 'asset ownership is immutable'); END;
CREATE TRIGGER asset_tags_same_owner_insert BEFORE INSERT ON asset_tags
WHEN NOT EXISTS (SELECT 1 FROM assets a JOIN tags t ON t.owner_user_id = a.owner_user_id WHERE a.id = NEW.asset_id AND t.id = NEW.tag_id)
BEGIN SELECT RAISE(ABORT, 'asset and tag must belong to the same owner'); END;
CREATE TRIGGER asset_tags_same_owner_update BEFORE UPDATE ON asset_tags
WHEN NOT EXISTS (SELECT 1 FROM assets a JOIN tags t ON t.owner_user_id = a.owner_user_id WHERE a.id = NEW.asset_id AND t.id = NEW.tag_id)
BEGIN SELECT RAISE(ABORT, 'asset and tag must belong to the same owner'); END;
