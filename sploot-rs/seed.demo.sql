INSERT INTO owners (id, created_at) VALUES ('demo', '2026-10-04T00:00:00Z');
INSERT INTO identities (subject, kind, owner_id, scopes, created_at, revoked_at)
VALUES ('demo@sploot.test', 'human', 'demo', '', '2026-10-04T00:00:00Z', NULL);
