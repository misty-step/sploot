CREATE TABLE owners (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE identities (
  subject TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('human','service')),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  scopes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
