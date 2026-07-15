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
    expect(preSql).toContain('NOBYPASSRLS NOINHERIT');
    expect(preSql).toContain('ALTER ROLE sploot_stripe_ledger_owner NOLOGIN');
    expect(preSql).toContain('ALTER ROLE sploot_stripe_adversary NOLOGIN');
    expect(preSql).toContain('FROM pg_auth_members');
    expect(preSql).toContain('REVOKE %I FROM %I');
    expect(postSql).toContain('final embedding claim-token schema contract is incomplete');
    expect(postSql).toContain('asset_embeddings_processing_claim_token_state');
    expect(postSql).toContain('asset_embeddings_revival_budget');
    expect(postSql).toContain('final embedding column type/default/nullability contract is incomplete');
    expect(postSql).toContain("'sploot_stripe_ledger_append_only',");
    expect(postSql).toContain("'enforce_asset_embedding_revival_budget'");
    expect(postSql).toContain(
      'create trigger stripe_cancellation_events_append_only before delete or update on stripe_cancellation_events',
    );
    expect(postSql).toContain(
      'CREATE TRIGGER stripe_cancellation_events_append_only BEFORE DELETE OR UPDATE ON public.stripe_cancellation_events',
    );
  });

  it('creates managed Stripe roles before converging their privileges', () => {
    const preSql = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-pre.sql'), 'utf8');
    const convergence = preSql.indexOf("'ALTER ROLE %I NOSUPERUSER");

    expect(convergence).toBeGreaterThan(-1);
    for (const role of ['sploot_stripe_ledger_owner', 'sploot_stripe_app']) {
      const creation = preSql.indexOf(`CREATE ROLE ${role}`);
      expect(creation, `${role} must be created on a fresh database`).toBeGreaterThan(-1);
      expect(creation, `${role} must exist before ALTER ROLE convergence`).toBeLessThan(convergence);
    }
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
    expect(ci).toContain('20260715000000_add_embedding_resilience/migration.sql');
    expect(ci).toContain('20260715020000_add_embedding_probe_lease_token/migration.sql');
    expect(ci).toContain("PGOPTIONS='-c lock_timeout=5s -c statement_timeout=30s'");
    expect(ci).toContain('migration_name" == 20260715*');
    expect(ci).toContain('legacy-upgrade-event');
    expect(ci).toContain('CREATE ROLE sploot_stripe_app SUPERUSER INHERIT');
    expect(ci).toContain("test \"$role_converged\" = 't'");
  });

  it('uses normalized exact catalog definitions and converged security state', () => {
    const verifier = readFileSync(resolve(webRoot, 'scripts/assert-final-embedding-schema.mjs'), 'utf8');
    expect(verifier).toContain('pg_get_indexdef(i.indexrelid)');
    expect(verifier).toContain('pg_get_constraintdef(oid)');
    expect(verifier).toContain('pg_get_functiondef(p.oid)');
    expect(verifier).toContain('pg_get_function_identity_arguments(p.oid)');
    expect(verifier).toContain('p_event_id text,p_event_type text');
    expect(verifier).toContain('pg_get_triggerdef(tr.oid)');
    expect(verifier).toContain('has_function_privilege');
    expect(verifier).toContain('pg_auth_members');
    expect(verifier).toContain('rolsuper');
    expect(verifier).toContain('version = $1');
    expect(verifier).not.toMatch(/version = \$[23]/);
    expect(verifier).not.toContain('[expectedDailyAttempts, expectedMonthlyAttempts, expectedVersion]');
    expect(verifier).toContain('20260715050000_cap_embedding_terminal_revivals/migration.sql');
    const finalContract = readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8')
      .slice(readFileSync(resolve(webRoot, 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8').indexOf('-- The bootstrap contract is not ready'));
    expect(finalContract).not.toMatch(/pg_get_(?:indexdef|constraintdef)\([^\n]+\)\s+LIKE/i);
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
