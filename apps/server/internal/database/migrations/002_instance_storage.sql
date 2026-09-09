-- Capacity is operator-configured for the instance, never an account quota.
DROP TABLE user_storage_quotas;

-- A committed intent owns files only after the corresponding asset is deleted
-- in the same transaction. Completed rows fence retries and old save receipts.
CREATE TABLE asset_purges (
    asset_id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL,
    pathname TEXT,
    thumbnail_path TEXT,
    storage_size INTEGER NOT NULL CHECK (storage_size >= 0),
    thumbnail_storage_size INTEGER NOT NULL CHECK (thumbnail_storage_size >= 0),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    CHECK ((completed_at IS NULL AND pathname IS NOT NULL) OR
           (completed_at IS NOT NULL AND pathname IS NULL AND thumbnail_path IS NULL AND storage_size = 0 AND thumbnail_storage_size = 0))
);
CREATE INDEX asset_purges_pending ON asset_purges(owner_user_id, asset_id) WHERE completed_at IS NULL;
