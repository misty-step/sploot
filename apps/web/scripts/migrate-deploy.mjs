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
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

export function runMigrateDeploy(env = process.env) {
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
    console.log('[migrate-deploy] running prisma migrate deploy...');
    execSync('prisma migrate deploy', { stdio: 'inherit', env: { ...env, DATABASE_URL: migrationAuthorityUrl ? deriveDirectUrl(migrationAuthorityUrl) : directUrl } });
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
// importing this module from a test does not trigger a migration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrateDeploy(process.env);
}
