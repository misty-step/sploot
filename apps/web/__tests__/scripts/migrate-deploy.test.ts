import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs script without type declarations; we test its pure helper.
import { deriveDirectUrl } from '../../scripts/migrate-deploy.mjs';

// migrate-deploy.mjs derives a direct (non-pooler) connection for `prisma
// migrate deploy`, because Prisma's advisory lock does not work through Neon's
// PgBouncer pooler. The risky bit is the URL transform; prove it in isolation.
// Fixtures use synthetic hosts only — never a real connection string.
describe('deriveDirectUrl', () => {
  it('strips the -pooler host suffix (pooled → direct)', () => {
    const out = deriveDirectUrl('postgresql://user:pass@db-pooler.example.com/app?sslmode=require');
    expect(out).toContain('@db.example.com/');
    expect(out).not.toContain('-pooler.');
  });

  it('removes the pgbouncer query param but keeps the rest', () => {
    const out = deriveDirectUrl(
      'postgresql://user:pass@db-pooler.example.com/app?sslmode=require&pgbouncer=true'
    );
    expect(out).not.toContain('pgbouncer');
    expect(out).toContain('sslmode=require');
  });

  it('leaves an already-direct url untouched', () => {
    const raw = 'postgresql://user:pass@db.example.com/app?sslmode=require';
    expect(deriveDirectUrl(raw)).toBe(raw);
  });
});
