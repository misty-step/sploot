#!/usr/bin/env node
// Run `prisma migrate deploy` so schema and code cannot ship apart
// (incident 2026-06-09: a user_identities migration never ran).
//
// Invoked only by the singleton DigitalOcean PRE_DEPLOY job. It fails closed
// without DATABASE_URL; build, local development, and the long-lived service
// start do not invoke this runner.
//
// Prisma migrations need a direct (non-pooler) connection. Prefer
// DATABASE_URL_DIRECT when set; otherwise derive it from DATABASE_URL by
// stripping the Neon `-pooler` host suffix and the `pgbouncer` query param.
//
// Privileged Stripe ledger bootstrap is a three-phase state machine:
//   pre (one transaction, marker 'preparing') -> restricted prisma migrate ->
//   post (one transaction, marker 'ready'). Any failure runs the
//   existence-safe rollback (marker 'failed') and, independently of the
//   rollback script, writes a durable failure report and a last-resort
//   'failed' marker so a partially bootstrapped database can never present as
//   healthy. The single declared contract version lives in
//   prisma/stripe-ledger-bootstrap.version and is passed to every psql run.
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDatabaseMigrationHistory, migrationHistoryClientConfig } from '../../../scripts/check-migration-history.mjs';

export function deriveDirectUrl(raw) {
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  return url.toString();
}

function findRepoRoot() {
  // Prefer the workspace marker walk from cwd (robust under bundlers/test
  // runners that rewrite import.meta.url), fall back to module location.
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

const repoRoot = findRepoRoot();

export function readBootstrapVersion(root = repoRoot) {
  const version = readFileSync(resolve(root, 'apps/web/prisma/stripe-ledger-bootstrap.version'), 'utf8').trim();
  if (!/^\d{14}$/.test(version)) {
    throw new Error('[migrate-deploy] stripe-ledger-bootstrap.version must contain the single 14-digit declared contract version');
  }
  return version;
}

const OWNER_VISIBILITY_MIGRATION = '20260717022000_enforce_asset_embedding_owner_visibility';
export const OWNER_VISIBILITY_BATCH_SIZE = 10_000;
export const OWNER_VISIBILITY_BATCH_TIMEOUT_MS = 30_000;

function requirePg() {
  const requireFromWeb = createRequire(pathToFileURL(join(repoRoot, 'apps/web/package.json')));
  return requireFromWeb('pg');
}

/** Drain the phase-one owner/live projection in independent 10k transactions. */
export async function drainOwnerVisibilityBackfill(databaseUrl, options = {}) {
  const clientConfig = {
    ...migrationHistoryClientConfig(databaseUrl),
    statement_timeout: OWNER_VISIBILITY_BATCH_TIMEOUT_MS,
    query_timeout: OWNER_VISIBILITY_BATCH_TIMEOUT_MS,
  };
  const client = options.createClient
    ? options.createClient(clientConfig)
    : new (requirePg().Client)(clientConfig);
  await client.connect();
  try {
    const capability = await client.query(
      `SELECT
         to_regprocedure('public.sploot_backfill_asset_embedding_owner_visibility(integer)')::text AS backfill_procedure,
         to_regprocedure('public.sploot_asset_embedding_visibility_backfill_remaining()')::text AS remaining_function`
    );
    const row = capability.rows[0] ?? {};
    if (!row.backfill_procedure || !row.remaining_function) {
      throw new Error('[migrate-deploy] owner visibility backfill authority is unavailable; refusing enforcement retry');
    }
    let batches = 0;
    while (true) {
      const before = await client.query(
        'SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining'
      );
      const remainingBefore = BigInt(String(before.rows[0]?.remaining ?? 0));
      if (remainingBefore === 0n) return { batches, remaining: 0 };
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(`SET LOCAL statement_timeout = '${OWNER_VISIBILITY_BATCH_TIMEOUT_MS}ms'`);
        await client.query(
          'CALL "sploot_backfill_asset_embedding_owner_visibility"($1)',
          [OWNER_VISIBILITY_BATCH_SIZE],
        );
        await client.query('COMMIT');
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* preserve batch error */ }
        throw error;
      }
      batches += 1;
      const after = await client.query(
        'SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining'
      );
      const remainingAfter = BigInt(String(after.rows[0]?.remaining ?? 0));
      if (remainingAfter === 0n) return { batches, remaining: 0 };
      if (remainingAfter >= remainingBefore) {
        throw new Error(`[migrate-deploy] owner visibility backfill made no progress; ${remainingAfter} rows remain`);
      }
    }
  } finally {
    await client.end();
  }
}

const compatibilityPath = resolve(repoRoot, 'apps/web/prisma/migration-history-compatibility.json');

/**
 * check-migration-history.mjs's `approved` map satisfies ITS OWN immutable-
 * history gate for a renamed already-applied migration, but Prisma's own
 * migrate-deploy state tracking knows nothing about that map: it reads
 * `_prisma_migrations` purely by folder name, sees the new name as
 * unapplied, and tries to re-run its SQL against a database that already
 * has the old name's effects (production incident 2026-07-23 -- the
 * `approved` mechanism had never actually been exercised before this).
 *
 * For every approved rename whose OLD name is genuinely finished (not
 * rolled back) and whose NEW name has no row yet, rename Prisma's own
 * bookkeeping row in place (never re-running its SQL). This must be an
 * in-place UPDATE, not `prisma migrate resolve --applied`: that command
 * INSERTS a second row for the new name, leaving the old row behind, and
 * check-migration-history.mjs's own gate then sees two applied identities
 * for the same logical migration on every subsequent run and fails closed
 * with "duplicate applied migration identity" forever after (caught by
 * local reproduction against a real database before this shipped: renaming
 * in place instead leaves exactly one row, matching `expected` directly).
 */
export async function resolveApprovedRenames(databaseUrl, options = {}) {
  const compatibility = options.compatibility ?? JSON.parse(readFileSync(compatibilityPath, 'utf8'));
  const entries = Object.entries(compatibility.approved ?? {});
  if (entries.length === 0) return { resolved: [] };
  const clientConfig = migrationHistoryClientConfig(databaseUrl);
  const client = options.createClient ? options.createClient(clientConfig) : new (requirePg().Client)(clientConfig);
  await client.connect();
  const resolved = [];
  try {
    // A genuinely fresh database (first-ever migrate-deploy run, e.g. CI's
    // ephemeral test database) has no _prisma_migrations table yet.
    // check-migration-history.mjs already guards this the same way; a
    // fresh install has nothing to reconcile a rename against.
    const existsResult = await client.query("SELECT to_regclass('public._prisma_migrations')::text AS ledger");
    if (!existsResult.rows[0]?.ledger) return { resolved: [] };
    const names = entries.flatMap(([oldName, { replacement }]) => [oldName, replacement]);
    const result = await client.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = ANY($1)',
      [names],
    );
    const byName = new Map(result.rows.map((row) => [row.migration_name, row]));
    for (const [oldName, { replacement }] of entries) {
      const oldRow = byName.get(oldName);
      const newRow = byName.get(replacement);
      if (oldRow?.finished_at && !oldRow.rolled_back_at && !newRow) {
        await client.query('UPDATE "_prisma_migrations" SET migration_name = $1 WHERE migration_name = $2', [replacement, oldName]);
        resolved.push(replacement);
      }
    }
  } finally {
    await client.end();
  }
  return { resolved };
}

export function isOwnerVisibilityEnforcementFailure(error) {
  const message = [error?.message, error?.stdout, error?.stderr].filter(Boolean).map(String).join('\n');
  if (!message.includes(OWNER_VISIBILITY_MIGRATION)) return false;
  // Production incident 2026-07-23: the DO block's own RAISE EXCEPTION text
  // ("asset embedding visibility enforcement refused: ...") is not always
  // what Prisma surfaces. schema-engine applies a migration.sql file as one
  // multi-statement batch; once the RAISE aborts the transaction, the two
  // trailing ALTER TABLE statements each fail with Postgres's generic
  // cascade error, and only the LAST one reaches this error's message. The
  // migration-name anchor above already scopes this to the one file whose
  // only failure mode is the backfill-remaining check, so treating the
  // cascade as equivalent evidence is safe.
  return message.includes('asset embedding visibility enforcement refused')
    || message.includes('current transaction is aborted, commands ignored until end of transaction block')
    || message.includes('unfinished migration');
}

// Spawns apply-online-embedding-index.mjs as its own process (not an
// import + call): CREATE INDEX CONCURRENTLY needs an autocommit connection
// outside migrate-deploy's own Prisma child and its PGOPTIONS
// lock_timeout=5s/statement_timeout=30s, which cannot bound either an
// online partial-index build or the far longer HNSW graph build. Running
// the helper as a full process (not this module's Client) means both
// applyOnlineEmbeddingIndex() and applyOnlineHnswIndex() execute via its
// own bottom-of-file guard, each on their own bounded-but-independent
// connection options.
function applyOnlineIndexes(databaseUrl, env) {
  const helper = resolve(repoRoot, 'apps/web/scripts/apply-online-embedding-index.mjs');
  execFileSync(process.execPath, [helper], {
    stdio: 'inherit',
    env: { ...env, DATABASE_URL: databaseUrl },
  });
}

// Last-resort durable failed state, independent of the rollback script.
const FAILED_MARKER_SQL = `
CREATE SCHEMA IF NOT EXISTS sploot_bootstrap;
CREATE TABLE IF NOT EXISTS sploot_bootstrap.stripe_ledger_bootstrap_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  phase TEXT NOT NULL,
  version TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ready_digest TEXT
);
INSERT INTO sploot_bootstrap.stripe_ledger_bootstrap_state(id, phase, version)
VALUES (TRUE, 'failed', 'unknown')
ON CONFLICT (id) DO UPDATE SET phase = 'failed', updated_at = CURRENT_TIMESTAMP, ready_digest = NULL;
`.trim();

function psqlEnvironment(rawUrl, env) {
  const url = new URL(rawUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !url.username || !database) {
    throw new Error('[migrate-deploy] privileged Postgres authority URL is malformed');
  }

  const childEnv = {
    ...env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) childEnv.PGSSLMODE = sslMode;
  return childEnv;
}

export async function runMigrateDeploy(env = process.env, options = {}) {
  const pooled = env.DATABASE_URL;
  const bootstrapUrl = env.STRIPE_LEDGER_BOOTSTRAP_DATABASE_URL;
  const bootstrapRequired = env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED === 'true';
  const migrationAuthorityUrl = env.STRIPE_LEDGER_MIGRATION_DATABASE_URL;

  if (!pooled) {
    throw new Error('[migrate-deploy] DATABASE_URL is required; refusing to start without migrations.');
  }

  if (bootstrapRequired && !bootstrapUrl) throw new Error('[migrate-deploy] privileged Stripe ledger bootstrap authority is required; refusing an unbootstrapped production migration');
  if (bootstrapRequired && !migrationAuthorityUrl) throw new Error('[migrate-deploy] privileged schema migration authority is required; refusing to run Prisma as the runtime app role');
  const directUrl = env.DATABASE_URL_DIRECT || (!bootstrapRequired ? deriveDirectUrl(pooled) : null);
  if (!directUrl && !migrationAuthorityUrl) throw new Error('[migrate-deploy] direct migration authority is required when privileged Stripe ledger bootstrap is enabled');

  const bootstrapVersion = bootstrapUrl ? readBootstrapVersion() : null;
  const pre = resolve(repoRoot, 'apps/web/prisma/stripe-ledger-bootstrap-pre.sql');
  const post = resolve(repoRoot, 'apps/web/prisma/stripe-ledger-bootstrap-post.sql');
  const rollback = resolve(repoRoot, 'apps/web/prisma/stripe-ledger-bootstrap-rollback.sql');
  const privilegedEnv = bootstrapUrl ? psqlEnvironment(bootstrapUrl, env) : env;
  const privileged = (file) => execFileSync('psql', ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--set', `bootstrap_version=${bootstrapVersion}`, '--file', file], { stdio: 'inherit', env: privilegedEnv });

  let stage = 'pre-bootstrap';
  try {
    if (bootstrapUrl) privileged(pre);
    stage = 'prisma-migrate';
    // Injectable so script-level fault tests need no live database; the
    // default is the workspace pg-client readback (no psql binary needed in
    // the PRE_DEPLOY image). Any history failure pauses the deployment.
    const historyCheck = options.checkMigrationHistory ?? checkDatabaseMigrationHistory;
    const migrationDatabaseUrl = migrationAuthorityUrl ? deriveDirectUrl(migrationAuthorityUrl) : directUrl;
    try {
      await historyCheck(migrationDatabaseUrl);
    } catch (error) {
      // A prior deploy attempt can leave the owner-visibility migration
      // unfinished-but-not-rolled-back (production incident 2026-07-23): the
      // history gate then fails closed on EVERY subsequent attempt, before
      // applyMigrations() below ever runs, so its own retry path never gets
      // a chance to self-heal. Resolve the same known-recoverable gate here
      // too, then re-verify history before proceeding.
      if (!isOwnerVisibilityEnforcementFailure(error)) throw error;
      stage = 'owner-visibility-backfill-precheck';
      const backfill = options.runOwnerVisibilityBackfill ?? drainOwnerVisibilityBackfill;
      await backfill(migrationDatabaseUrl);
      execFileSync('prisma', ['migrate', 'resolve', '--rolled-back', OWNER_VISIBILITY_MIGRATION], { stdio: 'inherit', env: { ...env, DATABASE_URL: migrationDatabaseUrl } });
      stage = 'prisma-migrate';
      await historyCheck(migrationDatabaseUrl);
    }
    stage = 'resolve-approved-renames';
    const resolveRenames = options.resolveApprovedRenames ?? resolveApprovedRenames;
    await resolveRenames(migrationDatabaseUrl);
    stage = 'prisma-migrate';
    console.log('[migrate-deploy] running prisma migrate deploy...');
    const migrationEnv = {
      ...env,
      DATABASE_URL: migrationDatabaseUrl,
      PGOPTIONS: [env.PGOPTIONS, '-c lock_timeout=5s', '-c statement_timeout=30s'].filter(Boolean).join(' '),
    };
    const applyMigrations = () => {
      try {
        return execFileSync('prisma', ['migrate', 'deploy'], { encoding: 'utf8', env: migrationEnv });
      } catch (error) {
        if (error?.stdout) process.stdout.write(String(error.stdout));
        if (error?.stderr) process.stderr.write(String(error.stderr));
        throw error;
      }
    };
    try {
      applyMigrations();
    } catch (error) {
      if (!isOwnerVisibilityEnforcementFailure(error)) throw error;
      stage = 'owner-visibility-backfill';
      const backfill = options.runOwnerVisibilityBackfill ?? drainOwnerVisibilityBackfill;
      await backfill(migrationEnv.DATABASE_URL);
      execFileSync('prisma', ['migrate', 'resolve', '--rolled-back', OWNER_VISIBILITY_MIGRATION], { stdio: 'inherit', env: migrationEnv });
      stage = 'prisma-migrate-retry';
      applyMigrations();
    }
    if (options.applyOnlineIndex ?? (env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'test')) {
      stage = 'online-indexes';
      applyOnlineIndexes(migrationDatabaseUrl, env);
    }
    stage = 'post-bootstrap';
    if (bootstrapUrl) privileged(post);
  } catch (error) {
    let rollbackError = null;
    let markerError = null;
    if (bootstrapUrl) {
      try {
        privileged(rollback);
      } catch (failure) {
        rollbackError = failure;
        // The rollback script itself failed: preserve an independently
        // durable failed state so the database cannot present as healthy.
        try {
          execFileSync('psql', ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', FAILED_MARKER_SQL], { stdio: 'inherit', env: privilegedEnv });
        } catch (markerFailure) {
          markerError = markerFailure;
        }
      }
      writeBootstrapFailureReport(env, { stage, error, rollbackError, markerError });
    }
    throw error;
  }
  console.log('[migrate-deploy] migrations applied.');
}

function writeBootstrapFailureReport(env, { stage, rollbackError, markerError }) {
  const reportPath = env.STRIPE_BOOTSTRAP_REPORT_PATH || resolve(repoRoot, 'stripe-ledger-bootstrap-failure-report.json');
  const report = {
    failedAt: new Date().toISOString(),
    stage,
    errorCode: `stripe_bootstrap_${stage}_failed`,
    rollback: rollbackError ? { status: 'failed', errorCode: 'stripe_bootstrap_rollback_failed' } : { status: 'completed' },
    lastResortMarker: rollbackError ? (markerError ? { status: 'failed', errorCode: 'stripe_bootstrap_failed_marker_write_failed' } : { status: 'completed' }) : { status: 'not-needed' },
    expectedDatabaseState: 'stripe_ledger_bootstrap_state.phase = failed (non-ready); operator remediation required before retry',
  };
  try {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[migrate-deploy] bootstrap failure report written to ${reportPath}`);
  } catch {
    console.error('[migrate-deploy] could not write bootstrap failure report');
    console.error(`[migrate-deploy] bootstrap failure report: ${JSON.stringify(report)}`);
  }
}

// Run only when invoked directly (`node scripts/migrate-deploy.mjs`), so that
// importing this module from a test does not trigger a migration. A rejected
// top-level await exits non-zero, which fails the PRE_DEPLOY job closed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMigrateDeploy(process.env);
}
