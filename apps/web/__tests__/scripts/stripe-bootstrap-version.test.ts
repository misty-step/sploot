import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Single declared version authority for the Stripe ledger bootstrap contract:
// prisma/stripe-ledger-bootstrap.version. Every consumer (pre/post SQL via the
// psql bootstrap_version variable, migrate-deploy.mjs, CI marker assertions)
// must read it instead of hardcoding a version, so the contract can never
// disagree with itself again (stop-ship: CI expected 030000 vs post 040000).

const webRoot = process.cwd();
const repoRoot = resolve(webRoot, '../..');
const versionFile = resolve(webRoot, 'prisma/stripe-ledger-bootstrap.version');

describe('stripe ledger bootstrap version authority', () => {
  const version = readFileSync(versionFile, 'utf8').trim();

  it('declares a single 14-digit contract version', () => {
    expect(version).toMatch(/^\d{14}$/);
  });

  it('matches the newest Prisma migration', () => {
    const prefixes = readdirSync(resolve(webRoot, 'prisma/migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.split('_')[0])
      .filter((prefix) => /^\d{8,14}$/.test(prefix))
      .map((prefix) => prefix.padEnd(14, '0'));
    const newest = prefixes.sort().at(-1);
    expect(newest).toBe(version);
  });

  it('is not hardcoded in any bootstrap SQL script', () => {
    for (const script of ['stripe-ledger-bootstrap-pre.sql', 'stripe-ledger-bootstrap-post.sql', 'stripe-ledger-bootstrap-rollback.sql']) {
      const sql = readFileSync(resolve(webRoot, 'prisma', script), 'utf8');
      expect(sql, `${script} must take the version from the bootstrap_version psql variable`).not.toMatch(/\b\d{14}\b/);
    }
    const preSql = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-pre.sql'), 'utf8');
    const postSql = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
    expect(preSql).toContain(":'bootstrap_version'");
    expect(postSql).toContain(":'bootstrap_version'");
    expect(preSql).toContain("d.deptype = 'e'");
    expect(preSql).toContain("'ALTER %s public.%I OWNER TO sploot_stripe_schema_migrator'");
  });

  it('is consumed by CI from the version file, never hardcoded', () => {
    const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('prisma/stripe-ledger-bootstrap.version');
    expect(ci).not.toMatch(/ready:\d{14}/);
    expect(ci).not.toMatch(/bootstrap_version=\d/);
  });
});
