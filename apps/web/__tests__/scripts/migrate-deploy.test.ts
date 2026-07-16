import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs script without type declarations; we test its pure helper.
import { deriveDirectUrl, runMigrateDeploy, readBootstrapVersion } from '../../scripts/migrate-deploy.mjs';

// migrate-deploy.mjs derives a direct (non-pooler) connection for `prisma
// migrate deploy`, because Prisma's advisory lock does not work through Neon's
// PgBouncer pooler.
describe('deriveDirectUrl', () => {
  it('strips the -pooler host suffix', () => {
    expect(deriveDirectUrl('postgresql://u@ep-abc-123-pooler.example.test/db?sslmode=require')).toBe(
      'postgresql://u@ep-abc-123.example.test/db?sslmode=require'
    );
  });

  it('removes the pgbouncer query param', () => {
    expect(deriveDirectUrl('postgresql://u@host.example.test/db?sslmode=require&pgbouncer=true')).toBe(
      'postgresql://u@host.example.test/db?sslmode=require'
    );
  });

  it('keeps already-direct URLs unchanged', () => {
    const raw = 'postgresql://u@ep-abc-123.example.test/db?sslmode=require';
    expect(deriveDirectUrl(raw)).toBe(raw);
  });
});

describe('runMigrateDeploy', () => {
  it.each([
    {},
    { NODE_ENV: 'production' },
    { DEPLOYMENT_ENV: 'production' },
  ])('fails closed without DATABASE_URL regardless of runtime metadata: %o', async env => {
    await expect(runMigrateDeploy(env)).rejects.toThrow('DATABASE_URL is required');
  });
});

describe('privileged production migration contract', () => {
  it('fails closed before touching Prisma when bootstrap authority or DATABASE_URL is absent', async () => {
    await expect(runMigrateDeploy({ STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).rejects.toThrow(/DATABASE_URL.*required/i);
    await expect(runMigrateDeploy({ DATABASE_URL: 'postgresql://db/app', STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).rejects.toThrow(/privileged Stripe ledger bootstrap authority/i);
    await expect(runMigrateDeploy({ DATABASE_URL: 'postgresql://db/app', STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL: 'postgresql://admin/db', STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).rejects.toThrow(/schema migration authority/i);
  });

  it('requires explicit privileged bootstrap authority and refuses to fall back to the runtime app URL', async () => {
    await expect(runMigrateDeploy({
      DATABASE_URL: 'postgresql://app-role:secret@db.example.com/app',
      STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true',
      STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL: 'postgresql://bootstrap:secret@db.example.com/app',
    })).rejects.toThrow(/schema migration authority/i);
  });
});

describe('migration-history gate runtime dependencies', () => {
  it('keeps the history gate free of external binaries (the PRE_DEPLOY image only proves Node + workspace deps)', () => {
    const source = readFileSync(join(process.cwd(), '../../scripts/check-migration-history.mjs'), 'utf8');
    expect(source).not.toContain('child_process');
    expect(source).not.toContain('execFileSync');
    expect(source).not.toContain('spawnSync');
    expect(source).toContain("requireFromWeb('pg')");
  });

  it('maps libpq sslmode deterministically and pauses on unknown modes', async () => {
    // @ts-expect-error — .mjs script without type declarations.
    const { pgSslConfig } = await import('../../../../scripts/check-migration-history.mjs');
    expect(pgSslConfig('postgresql://u@host/db?sslmode=disable')).toBe(false);
    expect(pgSslConfig('postgresql://u@host/db')).toBe(false);
    expect(pgSslConfig('postgresql://u@host/db?sslmode=require')).toEqual({ rejectUnauthorized: false });
    expect(pgSslConfig('postgresql://u@host/db?sslmode=verify-full')).toEqual({ rejectUnauthorized: true });
    expect(() => pgSslConfig('postgresql://u@host/db?sslmode=mystery')).toThrow(/unsupported sslmode/);
  });
});

describe('declared bootstrap version authority', () => {
  it('reads the single 14-digit contract version', () => {
    expect(readBootstrapVersion()).toMatch(/^\d{14}$/);
  });
});

describe('online migration transaction contract', () => {
  it('wraps every new regular embedding migration explicitly and keeps the index helper separate', () => {
    const migrationRoot = join(process.cwd(), 'prisma/migrations');
    const names = readdirSync(migrationRoot)
      .filter((name) => /^20260715\d+_/.test(name))
      .sort();
    expect(names).toEqual([
      '20260715000000_add_embedding_resilience',
      '20260715010000_add_embedding_circuit_generation',
      '20260715020000_add_embedding_probe_lease_token',
      '20260715030000_enforce_embedding_attempt_ceiling',
      '20260715035000_validate_embedding_attempt_ceiling',
      '20260715040000_add_embedding_processing_claim_token',
      '20260715045000_validate_embedding_processing_claim_token_state',
      '20260715050000_cap_embedding_terminal_revivals',
      '20260715055000_validate_embedding_revival_budget',
      '20260715060000_update_embedding_attempt_ceiling',
      '20260715065000_validate_embedding_attempt_ceiling',
      '20260715070000_harden_terminal_revival_exit',
      '20260715110000_restore_asset_embeddings_hnsw_index',
      '20260715120000_add_asset_embedding_owner_visibility',
      '20260715121000_backfill_asset_embedding_owner_visibility',
      '20260715122000_enforce_asset_embedding_owner_visibility',
    ]);
    for (const name of names) {
      const sql = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      expect(sql.trimStart()).toMatch(/^--[\s\S]*?\nBEGIN;/);
      expect(sql.trimEnd()).toMatch(/COMMIT;$/);
      expect(sql).not.toMatch(/CREATE INDEX CONCURRENTLY/);
    }
    const helper = readFileSync(join(process.cwd(), 'scripts/apply-online-embedding-index.mjs'), 'utf8');
    expect(helper).toContain('CREATE INDEX CONCURRENTLY');
    expect(helper).toContain('indisvalid');
    expect(helper).toContain('indisready');
  });

  it('keeps additive DDL replay-safe and validation in separate transactions', () => {
    const migrationRoot = join(process.cwd(), 'prisma/migrations');
    const additive = [
      '20260715030000_enforce_embedding_attempt_ceiling',
      '20260715040000_add_embedding_processing_claim_token',
      '20260715050000_cap_embedding_terminal_revivals',
      '20260715060000_update_embedding_attempt_ceiling',
    ];
    for (const name of additive) {
      const sql = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sql).toContain('IF NOT EXISTS');
      expect(sql).toContain('pg_constraint');
      expect(sql).not.toMatch(/ADD CONSTRAINT[\s\S]*VALIDATE CONSTRAINT/);
    }
    for (const name of [
      '20260715035000_validate_embedding_attempt_ceiling',
      '20260715045000_validate_embedding_processing_claim_token_state',
      '20260715055000_validate_embedding_revival_budget',
      '20260715065000_validate_embedding_attempt_ceiling',
    ]) {
      const sql = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      expect(sql).toContain('VALIDATE CONSTRAINT');
      expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sql).not.toContain('ADD CONSTRAINT');
    }
    const replacement = readFileSync(join(migrationRoot, '20260715070000_harden_terminal_revival_exit/migration.sql'), 'utf8');
    expect(replacement).toContain('CREATE OR REPLACE FUNCTION');
    expect(replacement).toContain('terminal embedding may exit only through bounded revival transition');
    expect(replacement).toContain("SET LOCAL lock_timeout = '5s'");
    expect(replacement).toContain("SET LOCAL statement_timeout = '30s'");
  });

  it('enforces bounded DDL timeouts at the migration runner boundary without rewriting applied SQL', () => {
    const runner = readFileSync(join(process.cwd(), 'scripts/migrate-deploy.mjs'), 'utf8');
    expect(runner).toContain("-c lock_timeout=5s");
    expect(runner).toContain("-c statement_timeout=30s");
  });

  it('binds the refreshed attempt ceiling to policy while preserving the immutable prior migration', () => {
    const migrationRoot = join(process.cwd(), 'prisma/migrations');
    const policy = JSON.parse(readFileSync(join(process.cwd(), '../../economics/policy.json'), 'utf8')) as {
      global: { replicateDailyAttempts: number; replicateMonthlyAttempts: number };
    };
    const previous = readFileSync(join(migrationRoot, '20260715030000_enforce_embedding_attempt_ceiling/migration.sql'), 'utf8');
    const correction = readFileSync(join(migrationRoot, '20260715060000_update_embedding_attempt_ceiling/migration.sql'), 'utf8');
    const validation = readFileSync(join(migrationRoot, '20260715065000_validate_embedding_attempt_ceiling/migration.sql'), 'utf8');
    const post = readFileSync(join(process.cwd(), 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');

    expect(previous).toContain('"count" <= 684');
    expect(previous).toContain('"count" <= 20547');
    expect(correction).toContain(`"count" <= ${policy.global.replicateDailyAttempts}`);
    expect(correction).toContain(`"count" <= ${policy.global.replicateMonthlyAttempts}`);
    expect(correction).toContain('DROP CONSTRAINT IF EXISTS');
    expect(correction).toContain('ADD CONSTRAINT "embedding_attempt_count_ceiling"');
    expect(validation).toContain('VALIDATE CONSTRAINT "embedding_attempt_count_ceiling"');
    expect(correction).not.toContain('VALIDATE CONSTRAINT');
    expect(post).toContain(`count<=${policy.global.replicateDailyAttempts}`);
    expect(post).toContain(`count<=${policy.global.replicateMonthlyAttempts}`);
  });

  it('asserts the final embedding schema in the deployment bootstrap contract', () => {
    const post = readFileSync(join(process.cwd(), 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
    for (const name of [
      'embedding_provider_circuits',
      'generation',
      'probe_until',
      'probe_generation',
      'probe_lease_token',
      'attempt_count',
      'next_attempt_at',
      'terminal_at',
      'embedding_attempt_count_ceiling',
      'processing_claim_token',
      'revive_count',
      'asset_embeddings_processing_claim_token_state',
      'asset_embeddings_revive_count_bounded',
      'asset_embeddings_revival_budget',
      'asset_embeddings_pending_next_attempt_idx',
      'embedding_provider_circuits_open_until_idx',
    ]) {
      expect(post).toContain(name);
    }
    expect(post).toContain('final embedding claim-token schema contract is incomplete');
  });

  it('keeps the terminal fence in the cap migration for rollback compatibility', () => {
    const sql = readFileSync(join(
      process.cwd(),
      'prisma/migrations/20260715050000_cap_embedding_terminal_revivals/migration.sql',
    ), 'utf8');
    expect(sql).toContain('terminal embedding cannot be claimed or written outside revival');
    expect(sql).toContain('NEW."status" IN (\'pending\', \'processing\', \'ready\')');
  });

  it('does not permit a terminal row to clear terminal_at into failed state', () => {
    const sql = readFileSync(join(
      process.cwd(),
      'prisma/migrations/20260715070000_harden_terminal_revival_exit/migration.sql',
    ), 'utf8');
    expect(sql).toMatch(/OLD\."terminal_at" IS NOT NULL AND NEW\."terminal_at" IS NULL/);
    expect(sql).toContain("NEW.\"status\" <> 'pending'");
    expect(sql).toContain('NEW."revive_count" <> OLD."revive_count"');
  });
});

// Script-level failure injection: psql/prisma are stubbed via PATH so the
// state machine (pre -> migrate -> post -> rollback/report) can be proven
// without a live database. The DB-level counterpart runs in CI/db-authority.
describe('bootstrap failure handling with injected faults', () => {
  const tempDirs: string[] = [];

  function makeHarness(options: { failOn?: string[]; prismaFail?: boolean } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-deploy-stub-'));
    tempDirs.push(dir);
    const log = join(dir, 'invocations.log');
    const report = join(dir, 'failure-report.json');
    writeFileSync(join(dir, 'psql'), [
      '#!/bin/sh',
      'echo "psql $*" >> "$STUB_LOG"',
      'for pat in $(printf %s "$STUB_PSQL_FAIL" | tr : " "); do',
      '  case "$*" in *"$pat"*) exit 42;; esac',
      'done',
      'exit 0',
      '',
    ].join('\n'));
    writeFileSync(join(dir, 'prisma'), [
      '#!/bin/sh',
      'echo "prisma $*" >> "$STUB_LOG"',
      'if [ "$STUB_PRISMA_FAIL" = "1" ]; then exit 3; fi',
      'exit 0',
      '',
    ].join('\n'));
    chmodSync(join(dir, 'psql'), 0o755);
    chmodSync(join(dir, 'prisma'), 0o755);
    const env = {
      PATH: `${dir}:/usr/bin:/bin`,
      STUB_LOG: log,
      STUB_PSQL_FAIL: (options.failOn ?? []).join(':'),
      STUB_PRISMA_FAIL: options.prismaFail ? '1' : '0',
      DATABASE_URL: 'postgresql://app:secret@db.example.test/app',
      STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL: 'postgresql://bootstrap:secret@db.example.test/app',
      STRIPE_LEDGER_MIGRATION_DATABASE_URL: 'postgresql://migrator:secret@db.example.test/app',
      STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true',
      STRIPE_BOOTSTRAP_REPORT_PATH: report,
    };
    const readLog = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    const readReport = () => (existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null);
    const historyCalls: string[] = [];
    const runOptions = {
      // The default history gate opens a real pg connection; script-level
      // fault tests inject a recorder so no live database is needed here.
      checkMigrationHistory: async (url: string) => {
        historyCalls.push(url);
        return { status: 'verified', checked: 0 };
      },
    };
    return { env, readLog, readReport, historyCalls, runOptions };
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('runs pre -> prisma migrate -> post with the declared version and writes no failure report', async () => {
    const harness = makeHarness();
    await runMigrateDeploy(harness.env, harness.runOptions);
    const log = harness.readLog();
    const order = ['stripe-ledger-bootstrap-pre.sql', 'prisma migrate deploy', 'stripe-ledger-bootstrap-post.sql'].map((needle) => log.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(log).toContain(`bootstrap_version=${readBootstrapVersion()}`);
    expect(log).not.toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(log).not.toContain('postgresql://');
    expect(log).not.toContain('bootstrap:secret');
    expect(harness.readReport()).toBeNull();
  });

  it('gives the history gate the direct migration authority, not the pooled runtime URL', async () => {
    const harness = makeHarness();
    await runMigrateDeploy(harness.env, harness.runOptions);
    expect(harness.historyCalls).toEqual(['postgresql://migrator:secret@db.example.test/app']);
  });

  it('pauses the deployment and rolls back when the immutable-history gate rejects', async () => {
    const harness = makeHarness();
    await expect(runMigrateDeploy(harness.env, {
      checkMigrationHistory: async () => {
        throw new Error('[migration-history] checksum mismatch for applied migration x; immutable history is paused');
      },
    })).rejects.toThrow('immutable history is paused');
    const log = harness.readLog();
    expect(log).not.toContain('prisma migrate deploy');
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(harness.readReport()).toMatchObject({ stage: 'prisma-migrate', rollback: { status: 'completed' } });
  });

  it('rolls back and writes a durable failure report when the post-bootstrap fails', async () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-post.sql'] });
    await expect(runMigrateDeploy(harness.env, harness.runOptions)).rejects.toThrow();
    const log = harness.readLog();
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    const report = harness.readReport();
    expect(report).toMatchObject({ stage: 'post-bootstrap', errorCode: 'stripe_bootstrap_post-bootstrap_failed', rollback: { status: 'completed' }, lastResortMarker: { status: 'not-needed' } });
    expect(JSON.stringify(report)).not.toContain('bootstrap:secret');
    expect(report.expectedDatabaseState).toMatch(/phase = failed/);
  });

  it('preserves an independently durable failed state when the rollback script itself fails', async () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-post.sql', 'stripe-ledger-bootstrap-rollback.sql'] });
    await expect(runMigrateDeploy(harness.env, harness.runOptions)).rejects.toThrow();
    const log = harness.readLog();
    // The last-resort marker write goes through psql --command with the
    // durable failed-state upsert.
    expect(log).toContain('stripe_ledger_bootstrap_state');
    expect(log).toContain("phase = 'failed'");
    const report = harness.readReport();
    expect(report).toMatchObject({ stage: 'post-bootstrap', rollback: { status: 'failed' }, lastResortMarker: { status: 'completed' } });
  });

  it('protects the pre-bootstrap inside the same failure path', async () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-pre.sql'] });
    await expect(runMigrateDeploy(harness.env, harness.runOptions)).rejects.toThrow();
    const log = harness.readLog();
    expect(log).not.toContain('prisma migrate deploy');
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(harness.readReport()).toMatchObject({ stage: 'pre-bootstrap', rollback: { status: 'completed' } });
    expect(harness.historyCalls).toEqual([]);
  });

  it('reports a failed prisma migration and still rolls back the bootstrap', async () => {
    const harness = makeHarness({ prismaFail: true });
    await expect(runMigrateDeploy(harness.env, harness.runOptions)).rejects.toThrow();
    const log = harness.readLog();
    expect(log).toContain('stripe-ledger-bootstrap-pre.sql');
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(harness.readReport()).toMatchObject({ stage: 'prisma-migrate' });
  });
});
