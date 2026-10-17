INSERT OR REPLACE INTO identities (subject, kind, owner_id, scopes, revoked_at) VALUES
  ('human-a@rebuild.test', 'human', 'owner-a', '*', NULL),
  ('human-b@rebuild.test', 'human', 'owner-b', '*', NULL),
  ('service-save', 'service', 'owner-a', 'save', NULL),
  ('service-revoked', 'service', 'owner-a', 'save,search', '2020-01-01T00:00:00Z');
