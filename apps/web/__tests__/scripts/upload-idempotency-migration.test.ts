import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDir = resolve(process.cwd(), 'prisma/migrations/20260714045000_add_upload_idempotency');

describe('upload idempotency migration posture', () => {
  it('is transactional, indexed for bounded cleanup, and has an explicit rollback/readback contract', () => {
    const migration = readFileSync(resolve(migrationDir, 'migration.sql'), 'utf8');
    const rollback = readFileSync(resolve(migrationDir, 'rollback.sql'), 'utf8');
    const readme = readFileSync(resolve(migrationDir, 'README.md'), 'utf8');
    const restrictedGrant = readFileSync(resolve(process.cwd(), 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');

    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('"retained_until" TIMESTAMP(3) NOT NULL');
    expect(migration).toContain('upload_idempotency_status_retained_until_idx');
    expect(rollback.trimStart()).toMatch(/^BEGIN;/);
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/);
    expect(readme).toContain('no existing rows require a backfill');
    expect(readme).toContain('information_schema.columns');
    expect(restrictedGrant).toMatch(/public\.embedding_rate_leases, public\.upload_idempotency\s+TO sploot_stripe_app/);
  });
});
