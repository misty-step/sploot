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
  ])('fails closed without DATABASE_URL regardless of runtime metadata: %o', env => {
    expect(() => runMigrateDeploy(env)).toThrow('DATABASE_URL is required');
  });
});

describe('privileged production migration contract', () => {
  it('fails closed before touching Prisma when bootstrap authority or DATABASE_URL is absent', () => {
    expect(() => runMigrateDeploy({ STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).toThrow(/DATABASE_URL.*required/i);
    expect(() => runMigrateDeploy({ DATABASE_URL: 'postgresql://db/app', STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).toThrow(/privileged Stripe ledger bootstrap authority/i);
    expect(() => runMigrateDeploy({ DATABASE_URL: 'postgresql://db/app', STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL: 'postgresql://admin/db', STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true' })).toThrow(/schema migration authority/i);
  });

  it('requires explicit privileged bootstrap authority and refuses to fall back to the runtime app URL', () => {
    expect(() => runMigrateDeploy({
      DATABASE_URL: 'postgresql://app-role:secret@db.example.com/app',
      STRIPE_LEDGER_BOOTSTRAP_REQUIRED: 'true',
      STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL: 'postgresql://bootstrap:secret@db.example.com/app',
    })).toThrow(/schema migration authority/i);
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
    ]) {
      const sql = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      expect(sql).toContain('VALIDATE CONSTRAINT');
      expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sql).not.toContain('ADD CONSTRAINT');
    }
  });

  it('asserts the final embedding schema in the deployment bootstrap contract', () => {
    const post = readFileSync(join(process.cwd(), 'prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
    for (const name of [
      'processing_claim_token',
      'revive_count',
      'asset_embeddings_processing_claim_token_state',
      'asset_embeddings_revive_count_bounded',
      'asset_embeddings_revival_budget',
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
    return { env, readLog, readReport };
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('runs pre -> prisma migrate -> post with the declared version and writes no failure report', () => {
    const harness = makeHarness();
    runMigrateDeploy(harness.env);
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

  it('rolls back and writes a durable failure report when the post-bootstrap fails', () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-post.sql'] });
    expect(() => runMigrateDeploy(harness.env)).toThrow();
    const log = harness.readLog();
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    const report = harness.readReport();
    expect(report).toMatchObject({ stage: 'post-bootstrap', errorCode: 'stripe_bootstrap_post-bootstrap_failed', rollback: { status: 'completed' }, lastResortMarker: { status: 'not-needed' } });
    expect(JSON.stringify(report)).not.toContain('bootstrap:secret');
    expect(report.expectedDatabaseState).toMatch(/phase = failed/);
  });

  it('preserves an independently durable failed state when the rollback script itself fails', () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-post.sql', 'stripe-ledger-bootstrap-rollback.sql'] });
    expect(() => runMigrateDeploy(harness.env)).toThrow();
    const log = harness.readLog();
    // The last-resort marker write goes through psql --command with the
    // durable failed-state upsert.
    expect(log).toContain('stripe_ledger_bootstrap_state');
    expect(log).toContain("phase = 'failed'");
    const report = harness.readReport();
    expect(report).toMatchObject({ stage: 'post-bootstrap', rollback: { status: 'failed' }, lastResortMarker: { status: 'completed' } });
  });

  it('protects the pre-bootstrap inside the same failure path', () => {
    const harness = makeHarness({ failOn: ['stripe-ledger-bootstrap-pre.sql'] });
    expect(() => runMigrateDeploy(harness.env)).toThrow();
    const log = harness.readLog();
    expect(log).not.toContain('prisma migrate deploy');
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(harness.readReport()).toMatchObject({ stage: 'pre-bootstrap', rollback: { status: 'completed' } });
  });

  it('reports a failed prisma migration and still rolls back the bootstrap', () => {
    const harness = makeHarness({ prismaFail: true });
    expect(() => runMigrateDeploy(harness.env)).toThrow();
    const log = harness.readLog();
    expect(log).toContain('stripe-ledger-bootstrap-pre.sql');
    expect(log).toContain('stripe-ledger-bootstrap-rollback.sql');
    expect(harness.readReport()).toMatchObject({ stage: 'prisma-migrate' });
  });
});
