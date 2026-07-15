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

  function extractFinalIfCondition(sql: string): string {
    const contractStart = sql.indexOf('-- The bootstrap contract is not ready');
    const ifStart = sql.indexOf('\n  IF ', contractStart);
    if (contractStart < 0 || ifStart < 0) {
      throw new Error('final bootstrap IF condition is missing');
    }

    let singleQuoted = false;
    for (let index = ifStart + '\n  IF '.length; index < sql.length; index += 1) {
      const character = sql[index];
      const next = sql[index + 1];

      if (singleQuoted && character === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (character === "'") {
        singleQuoted = !singleQuoted;
        continue;
      }
      if (!singleQuoted && sql.startsWith('THEN', index) && !/\w/.test(sql[index - 1] ?? '') && !/\w/.test(sql[index + 4] ?? '')) {
        return sql.slice(ifStart + '\n  IF '.length, index).trim();
      }
    }

    throw new Error('final bootstrap IF condition has no THEN');
  }

  function assertBalancedParentheses(sql: string): void {
    let depth = 0;
    let singleQuoted = false;

    for (let index = 0; index < sql.length; index += 1) {
      const character = sql[index];
      const next = sql[index + 1];

      if (singleQuoted && character === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (character === "'") {
        singleQuoted = !singleQuoted;
        continue;
      }
      if (singleQuoted) continue;
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (depth < 0) throw new Error(`unmatched closing parenthesis at offset ${index}`);
    }

    if (singleQuoted) throw new Error('unterminated SQL string');
    if (depth !== 0) throw new Error(`unbalanced parentheses: depth ${depth}`);
  }

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
    expect(postSql).toContain('final embedding claim-token schema contract is incomplete');
    expect(postSql).toContain('asset_embeddings_processing_claim_token_state');
    expect(postSql).toContain('asset_embeddings_revival_budget');
  });

  it('keeps the final embedding contract syntactically balanced before isolated DB execution', () => {
    const postSql = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
    const finalContract = postSql.slice(postSql.indexOf('-- The bootstrap contract is not ready'));
    expect(finalContract).toMatch(/DO \$\$\s*BEGIN/);
    const condition = extractFinalIfCondition(finalContract);
    expect(condition).toContain("to_regclass('public.embedding_provider_circuits_open_until_idx') IS NULL");
    assertBalancedParentheses(condition);
  });

  it('rejects the former extra closing parenthesis in the extracted final condition', () => {
    const postSql = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
    const finalContract = postSql.slice(postSql.indexOf('-- The bootstrap contract is not ready'));
    const mutatedContract = finalContract.replace('\n  THEN\n    RAISE EXCEPTION', '\n  ) THEN\n    RAISE EXCEPTION');

    expect(mutatedContract).not.toBe(finalContract);
    expect(() => assertBalancedParentheses(extractFinalIfCondition(mutatedContract))).toThrow(
      'unmatched closing parenthesis',
    );
  });

  it('retains isolated pg15/pg16 execution of the final bootstrap contract', () => {
    const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/pg:\s*\['15',\s*'16'\]/);
    expect(ci).toMatch(/psql [^\n]*-f apps\/web\/prisma\/stripe-ledger-bootstrap-post\.sql/);
    expect(ci).toContain('matrix.pg');
    expect(ci).toContain('ON_ERROR_STOP=1');
    expect(ci).toContain("EMBEDDING_INDEX_STATEMENT_TIMEOUT=5s");
    expect(ci).toContain('DROP INDEX CONCURRENTLY');
    expect(ci).toContain("PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s'");
    expect(ci).toContain('migration_name" == 20260715*');
    expect(ci).toContain('legacy-upgrade-event');
  });

  it('is consumed by CI from the version file, never hardcoded', () => {
    const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('prisma/stripe-ledger-bootstrap.version');
    expect(ci).not.toMatch(/ready:\d{14}/);
    expect(ci).not.toMatch(/bootstrap_version=\d/);
  });

  it('keeps the inert legacy-owner migration path self-contained before privileged activation', () => {
    const firstStripeMigration = readFileSync(
      resolve(webRoot, 'prisma/migrations/20260714000000_add_stripe_cancellation_ledger/migration.sql'),
      'utf8',
    );
    expect(firstStripeMigration).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/i);
  });
});
