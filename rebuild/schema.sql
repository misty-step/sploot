CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  subject TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('human', 'service')),
  owner_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  w INTEGER,
  h INTEGER,
  note TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  ocr_text TEXT NOT NULL DEFAULT '',
  content_version INTEGER NOT NULL,
  indexed_version INTEGER NOT NULL,
  pipeline_version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  index_error TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS assets_owner_sha ON assets (owner_id, sha256);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5 (
  note,
  caption,
  ocr_text,
  content = 'assets',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts (rowid, note, caption, ocr_text)
  VALUES (new.rowid, new.note, new.caption, new.ocr_text);
END;

CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, note, caption, ocr_text)
  VALUES ('delete', old.rowid, old.note, old.caption, old.ocr_text);
END;

CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts (assets_fts, rowid, note, caption, ocr_text)
  VALUES ('delete', old.rowid, old.note, old.caption, old.ocr_text);
  INSERT INTO assets_fts (rowid, note, caption, ocr_text)
  VALUES (new.rowid, new.note, new.caption, new.ocr_text);
END;
