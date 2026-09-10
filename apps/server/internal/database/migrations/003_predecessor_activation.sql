-- Only operator-imported, password-disabled accounts may consume invitations.
CREATE TABLE account_invitations (
    user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Private recovery provenance. Never exposed through owner/export HTTP routes.
-- capture_json preserves original PostgreSQL/Clerk receipts, not native receipts.
CREATE TABLE predecessor_imports (
    id TEXT PRIMARY KEY NOT NULL,
    capture_sha256 TEXT NOT NULL UNIQUE,
    capture_json TEXT NOT NULL,
    mapping_json TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
