import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs script without type declarations; we test its pure helper.
import { deriveDirectUrl, drainOwnerVisibilityBackfill, isOwnerVisibilityEnforcementFailure, OWNER_VISIBILITY_BATCH_SIZE, OWNER_VISIBILITY_BATCH_TIMEOUT_MS, resolveApprovedRenames, runMigrateDeploy, readBootstrapVersion } from '../../scripts/migrate-deploy.mjs';

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
  it('wraps every new regular migration explicitly and keeps the online index helper separate', () => {
    const migrationRoot = join(process.cwd(), 'prisma/migrations');
    const names = readdirSync(migrationRoot)
      .filter((name) => /^(20260715|20260717)\d+_/.test(name))
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
      '20260715075000_add_upload_idempotency',
      '20260715080000_add_library_exports',
      '20260715120000_index_upload_receipt_processing_sweep',
      '20260715130000_add_provider_neutral_storage',
      '20260717010000_restore_asset_embeddings_hnsw_index',
      '20260717020000_add_asset_embedding_owner_visibility',
      '20260717021000_backfill_asset_embedding_owner_visibility',
      '20260717022000_enforce_asset_embedding_owner_visibility',
      '20260717022100_finalize_asset_embedding_owner_visibility'
    ]);
    // Both predate the transaction-header-comment convention this suite
    // enforces below; add_upload_idempotency's own posture (transactional,
    // indexed, explicit rollback/readback contract) is covered separately
    // in upload-idempotency-migration.test.ts.
    const uncommented: Record<string, true> = {
      '20260715080000_add_library_exports': true,
      '20260715075000_add_upload_idempotency': true,
    };
    for (const name of names) {
      if (uncommented[name]) continue;
      const sql = readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8');
      expect(sql.trimStart()).toMatch(/^--[\s\S]*?\nBEGIN;/);
      expect(sql.trimEnd()).toMatch(/COMMIT;$/);
      expect(sql).not.toMatch(/CREATE INDEX CONCURRENTLY/);
    }
    const helper = readFileSync(join(process.cwd(), 'scripts/apply-online-embedding-index.mjs'), 'utf8');
    expect(helper).toContain('CREATE INDEX CONCURRENTLY');
    expect(helper).toContain('indisvalid');
    expect(helper).toContain('indisready');

    // The HNSW restore migration is a deliberate no-op marker: the real
    // CREATE INDEX CONCURRENTLY lives in the online-index helper, not in a
    // Prisma-transactional migration bound by migrate-deploy's global
    // PGOPTIONS statement_timeout=30s.
    const hnswMigration = readFileSync(
      join(migrationRoot, '20260717010000_restore_asset_embeddings_hnsw_index/migration.sql'),
      'utf8',
    );
    expect(hnswMigration).not.toMatch(/CREATE INDEX/);
    expect(hnswMigration).not.toMatch(/USING hnsw/);
    expect(helper).toContain('applyOnlineHnswIndex');
    expect(helper).toContain('asset_embeddings_hnsw_idx');
    expect(helper).toContain('USING hnsw');
  });

  it('keeps the HNSW online index helper on an independent, generously-bounded timeout, never the global 30s', () => {
    const helper = readFileSync(join(process.cwd(), 'scripts/apply-online-embedding-index.mjs'), 'utf8');
    // The HNSW build must not inherit migrate-deploy's global
    // PGOPTIONS statement_timeout=30s (apps/web/scripts/migrate-deploy.mjs) --
    // an HNSW graph build on a production-sized table routinely exceeds 30s.
    expect(helper).toContain('ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT');
    expect(helper).not.toMatch(/ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT\s*=\s*'30s'/);
    expect(helper).toContain('EMBEDDING_HNSW_INDEX_STATEMENT_TIMEOUT');
    expect(helper).toContain('EMBEDDING_HNSW_INDEX_LOCK_TIMEOUT');
  });

  it('never DROP/CREATEs a valid, ready, contract-matching HNSW index on repeat deploys', () => {
    const helper = readFileSync(join(process.cwd(), 'scripts/apply-online-embedding-index.mjs'), 'utf8');
    expect(helper).toMatch(/rowIsCorrect[\s\S]*?return;/);
    expect(helper).toContain('pg_get_indexdef');
    expect(helper).toContain('does not match the declared cosine HNSW contract');
  });

  it('runs the online-index helper as an independent process, not inside the Prisma migrate-deploy transaction', () => {
    const runner = readFileSync(join(process.cwd(), 'scripts/migrate-deploy.mjs'), 'utf8');
    expect(runner).toContain('applyOnlineIndexes');
    expect(runner).toMatch(/execFileSync\(process\.execPath, \[helper\]/);
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

  it('keeps owner visibility draining separate from final enforcement', () => {
    const migrationRoot = join(process.cwd(), 'prisma/migrations');
    const backfill = readFileSync(join(migrationRoot, '20260717021000_backfill_asset_embedding_owner_visibility/migration.sql'), 'utf8');
    const enforcement = readFileSync(join(migrationRoot, '20260717022000_enforce_asset_embedding_owner_visibility/migration.sql'), 'utf8');
    const finalization = readFileSync(join(migrationRoot, '20260717022100_finalize_asset_embedding_owner_visibility/migration.sql'), 'utf8');

    expect(backfill).toContain('CREATE OR REPLACE PROCEDURE');
    expect(backfill).toContain('LIMIT p_batch_size');
    expect(backfill).toContain('FOR UPDATE OF embedding SKIP LOCKED');
    expect(backfill).not.toContain('CALL "sploot_backfill_asset_embedding_owner_visibility"');

    expect(enforcement).toContain('CHECK ("owner_user_id" IS NOT NULL)');
    expect(enforcement).toContain('ADD CONSTRAINT "asset_embeddings_owner_user_id_fkey"');
    expect(enforcement).toContain('NOT VALID');
    expect(enforcement).not.toContain('VALIDATE CONSTRAINT');
    expect(finalization).toContain('VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_not_null"');
    expect(finalization).toContain('VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_fkey"');
    expect(finalization.indexOf('VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_not_null"')).toBeLessThan(
      finalization.indexOf('ALTER COLUMN "owner_user_id" SET NOT NULL'),
    );
    expect(finalization).toContain('DROP CONSTRAINT "asset_embeddings_owner_user_id_not_null"');
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

// Production incident 2026-07-23 follow-up: migration-history-
// compatibility.json's `approved` map had never actually been exercised
// (it was empty until #315's rename). Satisfying check-migration-history's
// OWN gate says nothing about Prisma's own `_prisma_migrations` state --
// Prisma still reads by folder name and tries to re-run the renamed
// migration's SQL against a database that already has its effects.
describe('resolveApprovedRenames', () => {
  function fakeClient(rows: Array<{ migration_name: string; finished_at: string | null; rolled_back_at: string | null }>) {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      connect: async () => {},
      end: async () => {},
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('to_regclass')) return { rows: [{ ledger: 'public._prisma_migrations' }] };
        if (sql.startsWith('UPDATE')) return { rows: [] };
        return { rows };
      },
      queries,
    };
  }

  const compatibility = {
    approved: {
      'old-name': { checksum: 'abc', replacement: 'new-name' },
    },
  };

  it('renames the bookkeeping row in place when the old name finished and the new name has no row yet', async () => {
    const client = fakeClient([{ migration_name: 'old-name', finished_at: 'done', rolled_back_at: null }]);
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: ['new-name'] });
    const update = client.queries.find(({ sql }) => sql.startsWith('UPDATE'));
    expect(update?.params).toEqual(['new-name', 'old-name']);
    // Never a second INSERTed row for the same logical migration -- that
    // shape is exactly what made check-migration-history.mjs's own gate
    // see a permanent duplicate identity on every subsequent run.
    expect(client.queries.some(({ sql }) => sql.startsWith('INSERT'))).toBe(false);
  });

  it('does nothing once the replacement already has its own row', async () => {
    const client = fakeClient([
      { migration_name: 'old-name', finished_at: 'done', rolled_back_at: null },
      { migration_name: 'new-name', finished_at: 'done', rolled_back_at: null },
    ]);
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: [] });
    expect(client.queries.some(({ sql }) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('does nothing when the old name was itself rolled back rather than genuinely applied', async () => {
    const client = fakeClient([{ migration_name: 'old-name', finished_at: null, rolled_back_at: 'done' }]);
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: [] });
    expect(client.queries.some(({ sql }) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('does nothing when the old name has no row (table exists but nothing to reconcile yet)', async () => {
    const client = fakeClient([]);
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: [] });
    expect(client.queries.some(({ sql }) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('regression 2026-07-23: never queries a nonexistent _prisma_migrations table (CI-fresh database, first-ever migrate-deploy run)', async () => {
    const queries: string[] = [];
    const client = {
      connect: async () => {},
      end: async () => {},
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('to_regclass')) return { rows: [{ ledger: null }] };
        throw new Error('relation "_prisma_migrations" does not exist');
      },
    };
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: [] });
    expect(queries).toHaveLength(1);
  });

  it('never opens a database connection when there are no approved renames declared', async () => {
    let connected = false;
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility: { approved: {} },
      createClient: () => { connected = true; return fakeClient([]); },
    });
    expect(result).toEqual({ resolved: [] });
    expect(connected).toBe(false);
  });

  it('regression 2026-07-23: reproduces the exact production incident end to end against real Postgres', async () => {
    // Live reproduction (2026-07-23, local pgvector Postgres): a fresh
    // database ran the full migration set once under the CURRENT (already
    // renamed) 20260715075000_add_upload_idempotency name, then that row
    // was rewritten back to the OLD 20260714045000_add_upload_idempotency
    // name and checksum to reconstruct exactly what production's prior
    // deploy attempt (before #315's rename even existed) actually left
    // behind. Running migrate-deploy.mjs again against that database
    // succeeded end to end, and a second checkDatabaseMigrationHistory call
    // afterward (this test's assertion) found no duplicate identity --
    // proving the in-place UPDATE, not `prisma migrate resolve --applied`,
    // is the correct fix. This test pins the exact real compatibility.json
    // entry so a future edit to it cannot silently regress to the
    // insert-a-second-row shape without failing here.
    const compatibilityPath = join(process.cwd(), 'prisma/migration-history-compatibility.json');
    const real = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
    const [oldName, approved] = Object.entries(real.approved)[0] as [string, { checksum: string; replacement: string }];
    const client = fakeClient([{ migration_name: oldName, finished_at: 'done', rolled_back_at: null }]);
    const result = await resolveApprovedRenames('postgresql://u:p@db.example.test/app', {
      compatibility: real,
      createClient: () => client,
    });
    expect(result).toEqual({ resolved: [approved.replacement] });
    const update = client.queries.find(({ sql }) => sql.startsWith('UPDATE'));
    expect(update?.params).toEqual([approved.replacement, oldName]);
  });
});

// Script-level failure injection: psql/prisma are stubbed via PATH so the
// state machine (pre -> migrate -> post -> rollback/report) can be proven
// without a live database. The DB-level counterpart runs in CI/db-authority.
describe('bootstrap failure handling with injected faults', () => {
  const tempDirs: string[] = [];

  function makeHarness(options: { failOn?: string[]; prismaFail?: boolean; ownerMigrationFail?: boolean } = {}) {
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
      'case "$*" in *"migrate deploy"*) if [ "$STUB_OWNER_MIGRATION_FAIL" = "1" ] && ! grep -q "migrate resolve --rolled-back" "$STUB_LOG"; then echo "P3018 20260717022000_enforce_asset_embedding_owner_visibility: asset embedding visibility enforcement refused: 1 rows remain" >&2; exit 3; fi ;; esac',
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
      STUB_OWNER_MIGRATION_FAIL: options.ownerMigrationFail ? '1' : '0',
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
      // Same reasoning: the default renames reconciler also opens a real pg
      // connection. No test in this file exercises an approved rename
      // against a live database; that lives in the dedicated unit tests for
      // resolveApprovedRenames() below, which inject their own createClient.
      resolveApprovedRenames: async () => ({ resolved: [] }),
    };
    return { env, readLog, readReport, historyCalls, runOptions };
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('drains owner visibility in bounded batches with timeout and readback per batch', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const remaining = ['25001', '15001', '15001', '5001', '5001', '0'];
    const client = {
      connect: async () => {},
      end: async () => {},
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('to_regprocedure')) {
          return { rows: [{ backfill_procedure: 'sploot_backfill_asset_embedding_owner_visibility(integer)', remaining_function: 'sploot_asset_embedding_visibility_backfill_remaining()' }] };
        }
        if (sql.includes('backfill_remaining')) return { rows: [{ remaining: remaining.shift() }] };
        return { rows: [] };
      },
    };
    let config: Record<string, unknown> | undefined;
    const result = await drainOwnerVisibilityBackfill('postgresql://u:p@db.example.test/app?sslmode=require', {
      createClient: (candidateConfig: Record<string, unknown>) => {
        config = candidateConfig;
        return client;
      },
    });

    expect(result).toEqual({ batches: 3, remaining: 0 });
    expect(config).toMatchObject({
      statement_timeout: OWNER_VISIBILITY_BATCH_TIMEOUT_MS,
      query_timeout: OWNER_VISIBILITY_BATCH_TIMEOUT_MS,
    });
    const batchCalls = calls.filter(({ sql }) => sql.includes('CALL "sploot_backfill_asset_embedding_owner_visibility"'));
    expect(batchCalls).toHaveLength(3);
    expect(batchCalls.every(({ params }) => Array.isArray(params))).toBe(true);
    expect(batchCalls.map(({ params }) => params)).toEqual([
      [OWNER_VISIBILITY_BATCH_SIZE],
      [OWNER_VISIBILITY_BATCH_SIZE],
      [OWNER_VISIBILITY_BATCH_SIZE],
    ]);
    expect(calls.filter(({ sql }) => sql === 'BEGIN')).toHaveLength(3);
    expect(calls.filter(({ sql }) => sql === 'COMMIT')).toHaveLength(3);
    expect(calls.filter(({ sql }) => sql.includes('SET LOCAL lock_timeout'))).toHaveLength(3);
    expect(calls.filter(({ sql }) => sql.includes('SET LOCAL statement_timeout'))).toHaveLength(3);
    expect(calls.filter(({ sql }) => sql.includes('SELECT \"sploot_asset_embedding_visibility_backfill_remaining\"'))).toHaveLength(6);
  });

  it('retries fail-closed owner enforcement only after a drained readback', async () => {
    const harness = makeHarness({ ownerMigrationFail: true });
    const backfillUrls: string[] = [];
    await runMigrateDeploy(harness.env, {
      ...harness.runOptions,
      runOwnerVisibilityBackfill: async (url: string) => { backfillUrls.push(url); },
    });
    const log = harness.readLog();
    const firstDeploy = log.indexOf('prisma migrate deploy');
    const resolve = log.indexOf('migrate resolve --rolled-back 20260717022000_enforce_asset_embedding_owner_visibility');
    const secondDeploy = log.indexOf('prisma migrate deploy', firstDeploy + 1);
    const post = log.indexOf('stripe-ledger-bootstrap-post.sql');
    expect(firstDeploy).toBeGreaterThanOrEqual(0);
    expect(resolve).toBeGreaterThan(firstDeploy);
    expect(secondDeploy).toBeGreaterThan(resolve);
    expect(post).toBeGreaterThan(secondDeploy);
    expect(backfillUrls).toEqual(['postgresql://migrator:secret@db.example.test/app']);
    expect(harness.historyCalls).toHaveLength(1);
    expect(harness.readReport()).toBeNull();
  });

  it('regression 2026-07-23: self-heals a stale unfinished owner-visibility row before applyMigrations ever runs', async () => {
    // Production incident: a PRIOR failed deploy attempt left the
    // owner-visibility migration unfinished-but-not-rolled-back. Every
    // subsequent attempt's own history pre-check (which runs BEFORE
    // applyMigrations()) then fails closed with "unfinished migration",
    // so the existing applyMigrations()-side retry above never gets a
    // chance to run. The pre-check itself must now drain+resolve too.
    const harness = makeHarness();
    const backfillUrls: string[] = [];
    let historyCallCount = 0;
    const resolveCalls: string[] = [];
    await runMigrateDeploy(harness.env, {
      ...harness.runOptions,
      checkMigrationHistory: async (url: string) => {
        historyCallCount += 1;
        if (historyCallCount === 1) {
          throw new Error('[migration-history] unfinished migration 20260717022000_enforce_asset_embedding_owner_visibility; deployment is paused');
        }
        return { status: 'verified', checked: 44 };
      },
      runOwnerVisibilityBackfill: async (url: string) => { backfillUrls.push(url); },
    });
    const log = harness.readLog();
    resolveCalls.push(...log.split('\n').filter((line) => line.includes('migrate resolve --rolled-back')));
    expect(historyCallCount).toBe(2);
    expect(backfillUrls).toEqual(['postgresql://migrator:secret@db.example.test/app']);
    expect(resolveCalls).toHaveLength(1);
    expect(log).toContain('prisma migrate deploy');
    // The pre-check's own resolve must run before the first real
    // "prisma migrate deploy" attempt, not after it.
    expect(log.indexOf('migrate resolve --rolled-back')).toBeLessThan(log.indexOf('prisma migrate deploy'));
    expect(harness.readReport()).toBeNull();
  });

  it('recognizes only the owner enforcement gate as recoverable', () => {
    expect(isOwnerVisibilityEnforcementFailure(new Error('P3018 20260717022000_enforce_asset_embedding_owner_visibility: asset embedding visibility enforcement refused: 1 rows remain'))).toBe(true);
    expect(isOwnerVisibilityEnforcementFailure(new Error('P3018 20260717022000_enforce_asset_embedding_owner_visibility: lock timeout'))).toBe(false);
    expect(isOwnerVisibilityEnforcementFailure(new Error('asset embedding visibility enforcement refused'))).toBe(false);
  });

  it('regression 2026-07-23: recognizes the pre-check "unfinished migration" text a stale unresolved row leaves behind', () => {
    expect(isOwnerVisibilityEnforcementFailure(new Error(
      '[migration-history] unfinished migration 20260717022000_enforce_asset_embedding_owner_visibility; deployment is paused',
    ))).toBe(true);
    // A different unfinished migration must never be misclassified.
    expect(isOwnerVisibilityEnforcementFailure(new Error(
      '[migration-history] unfinished migration 20260101000000_unrelated_migration; deployment is paused',
    ))).toBe(false);
    // The compatibility-branch variant names a distinct condition
    // ("unfinished compatibility migration") that does not contain the
    // plain phrase as a contiguous substring, so it is not (yet) treated
    // as this specific recoverable gate.
    expect(isOwnerVisibilityEnforcementFailure(new Error(
      '[migration-history] unfinished compatibility migration 20260717022000_enforce_asset_embedding_owner_visibility; deployment is paused',
    ))).toBe(false);
  });

  it('regression 2026-07-23: recognizes the cascading transaction-aborted error Prisma actually surfaces when the RAISE fires mid-batch', () => {
    // Production incident: schema-engine applies migration.sql as one
    // multi-statement batch. The DO block's RAISE aborts the transaction,
    // but the trailing ALTER TABLE statements in the same batch report
    // Postgres's generic cascade error instead of the RAISE's own message,
    // and only the last one reaches the thrown error.
    const cascade = new Error('Command failed: prisma migrate deploy');
    cascade.stderr = [
      'Error: ERROR: current transaction is aborted, commands ignored until end of transaction block',
      '   0: schema_commands::commands::apply_migrations::Applying migration',
      '           with migration_name="20260717022000_enforce_asset_embedding_owner_visibility"',
    ].join('\n');
    expect(isOwnerVisibilityEnforcementFailure(cascade)).toBe(true);

    // A different migration hitting the same generic cascade text must not
    // be misclassified as the owner-visibility gate.
    const unrelated = new Error('Command failed: prisma migrate deploy');
    unrelated.stderr = [
      'Error: ERROR: current transaction is aborted, commands ignored until end of transaction block',
      '   0: schema_commands::commands::apply_migrations::Applying migration',
      '           with migration_name="20260101000000_unrelated_migration"',
    ].join('\n');
    expect(isOwnerVisibilityEnforcementFailure(unrelated)).toBe(false);
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
