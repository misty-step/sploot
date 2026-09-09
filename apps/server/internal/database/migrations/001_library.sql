CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
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
    UNIQUE (owner_user_id, checksum_sha256),
    UNIQUE (id, owner_user_id)
);
CREATE INDEX assets_owner_created ON assets(owner_user_id, deleted_at, created_at, id);
CREATE INDEX assets_owner_shuffle ON assets(owner_user_id, deleted_at, shuffle_key, id);
CREATE INDEX assets_owner_updated ON assets(owner_user_id, deleted_at, updated_at, id);

CREATE TABLE tags (
    id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_user_id, name)
);
CREATE TABLE asset_tags (
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, tag_id)
);
CREATE INDEX asset_tags_tag ON asset_tags(tag_id, asset_id);
CREATE TRIGGER asset_tags_same_owner_insert BEFORE INSERT ON asset_tags
WHEN NOT EXISTS (SELECT 1 FROM assets a JOIN tags t ON t.owner_user_id = a.owner_user_id WHERE a.id = NEW.asset_id AND t.id = NEW.tag_id)
BEGIN SELECT RAISE(ABORT, 'asset and tag must belong to the same owner'); END;
CREATE TRIGGER asset_tags_same_owner_update BEFORE UPDATE ON asset_tags
WHEN NOT EXISTS (SELECT 1 FROM assets a JOIN tags t ON t.owner_user_id = a.owner_user_id WHERE a.id = NEW.asset_id AND t.id = NEW.tag_id)
BEGIN SELECT RAISE(ABORT, 'asset and tag must belong to the same owner'); END;
CREATE TRIGGER assets_immutable_owner BEFORE UPDATE OF owner_user_id ON assets
WHEN NEW.owner_user_id != OLD.owner_user_id
BEGIN SELECT RAISE(ABORT, 'asset ownership is immutable'); END;
CREATE TRIGGER tags_immutable_owner BEFORE UPDATE OF owner_user_id ON tags
WHEN NEW.owner_user_id != OLD.owner_user_id
BEGIN SELECT RAISE(ABORT, 'tag ownership is immutable'); END;

CREATE TABLE asset_embeddings (
    asset_id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL,
    model_name TEXT NOT NULL DEFAULT 'Xenova/clip-vit-base-patch32',
    model_version TEXT NOT NULL DEFAULT '',
    dim INTEGER NOT NULL DEFAULT 0,
    image_embedding BLOB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    error TEXT,
    processing_token TEXT,
    processing_until DATETIME,
    next_attempt_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id, owner_user_id) REFERENCES assets(id, owner_user_id) ON DELETE CASCADE,
    CHECK ((status = 'ready' AND dim = 512 AND typeof(image_embedding) = 'blob' AND length(image_embedding) = 2048 AND model_version != '') OR
           (status != 'ready' AND dim = 0 AND image_embedding IS NULL)),
    CHECK ((status = 'processing' AND processing_token IS NOT NULL AND processing_until IS NOT NULL) OR
           (status != 'processing' AND processing_token IS NULL AND processing_until IS NULL))
);
CREATE INDEX asset_embeddings_queue ON asset_embeddings(status, next_attempt_at, created_at);
CREATE INDEX asset_embeddings_owner_model ON asset_embeddings(owner_user_id, model_version, status);

CREATE TABLE query_embeddings (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    model_version TEXT NOT NULL,
    embedding BLOB NOT NULL CHECK (typeof(embedding) = 'blob' AND length(embedding) = 2048),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, query, model_version)
);
CREATE INDEX query_embeddings_expiration ON query_embeddings(user_id, created_at);

CREATE TABLE upload_idempotency (
    id TEXT PRIMARY KEY NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    status TEXT NOT NULL,
    result BLOB,
    lease_token TEXT,
    lease_expires_at DATETIME,
    retained_until DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_user_id, key)
);
CREATE TABLE user_storage_quotas (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    limit_bytes INTEGER NOT NULL DEFAULT 1073741824 CHECK (limit_bytes >= 0),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE upload_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    revoked_at DATETIME,
    last_used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX upload_tokens_owner ON upload_tokens(user_id, revoked_at);
CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('browser', 'device')),
    name TEXT NOT NULL DEFAULT '',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
);
CREATE INDEX auth_sessions_owner ON auth_sessions(user_id, kind);
CREATE INDEX auth_sessions_expiration ON auth_sessions(expires_at);
CREATE TABLE device_requests (
    device_code_hash TEXT PRIMARY KEY NOT NULL,
    user_code TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    approved_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    denied_at DATETIME,
    consumed_at DATETIME,
    poll_after DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX device_requests_expiration ON device_requests(expires_at);
CREATE TABLE auth_attempts (
    key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    window_start DATETIME NOT NULL
);
CREATE INDEX auth_attempts_window ON auth_attempts(window_start);

CREATE TABLE request_limits (
    key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    expires_at DATETIME NOT NULL
);
CREATE INDEX request_limits_expiration ON request_limits(expires_at);
