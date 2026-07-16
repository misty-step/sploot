#!/usr/bin/env node

// Immutable-history gate for the deploy-owned migration runner.
//
// Deliberately free of any external binary: the DigitalOcean PRE_DEPLOY image
// only proves Node plus installed workspace dependencies, so the database
// readback uses the workspace `pg` client (resolved from apps/web) rather
// than shelling out to an unproven `psql`. Any connection, TLS, or query
// failure rejects and pauses the deployment — fail closed, never fail open.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleUrl = new URL(import.meta.url);
// Vitest may expose a non-file module URL; production Node uses file URLs.
// Keep both paths portable without treating a Windows drive as a POSIX root.
const repoRoot = moduleUrl.protocol === 'file:'
  ? fileURLToPath(new URL('..', moduleUrl))
  : resolve(moduleUrl.pathname, '..');
const migrationRoot = resolve(repoRoot, 'apps/web/prisma/migrations');
const compatibilityPath = resolve(repoRoot, 'apps/web/prisma/migration-history-compatibility.json');

export function currentMigrationChecksums(root = migrationRoot) {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const sql = readFileSync(join(root, entry.name, 'migration.sql'));
      return [entry.name, createHash('sha256').update(sql).digest('hex')];
    }));
}

function migrationPrefix(name) {
  return name.split('_', 1)[0];
}

export function assertUniqueMigrationPrefixes(expected, compatibility = { prefixExceptions: [] }) {
  const namesByPrefix = new Map();
  for (const name of Object.keys(expected)) {
    const prefix = migrationPrefix(name);
    const names = namesByPrefix.get(prefix) ?? [];
    names.push(name);
    namesByPrefix.set(prefix, names);
  }

  for (const [prefix, names] of namesByPrefix) {
    if (names.length < 2) continue;
    const exception = compatibility.prefixExceptions?.find((candidate) => candidate.prefix === prefix);
    if (!exception || typeof exception.authority !== 'string' || exception.authority.trim() === '') {
      throw new Error(`[migration-history] duplicate migration prefix ${prefix}; explicit identity authority is required`);
    }
    if (!Array.isArray(exception.migrationNames)
      || [...exception.migrationNames].sort().join('\n') !== [...names].sort().join('\n')) {
      throw new Error(`[migration-history] prefix exception ${prefix} does not match repository migration identities`);
    }
  }

  for (const exception of compatibility.prefixExceptions ?? []) {
    if (!exception || typeof exception.prefix !== 'string' || !Array.isArray(exception.migrationNames)) {
      throw new Error('[migration-history] malformed prefix exception; deployment is paused');
    }
    const actualNames = Object.keys(expected).filter((name) => migrationPrefix(name) === exception.prefix).sort();
    if ([...exception.migrationNames].sort().join('\n') !== actualNames.join('\n')) {
      throw new Error(`[migration-history] prefix exception ${exception.prefix} does not match repository migration identities`);
    }
  }
}

export function assertMigrationHistory(rows, expected, compatibility = { approved: {} }) {
  const expectedOrder = Object.keys(expected).sort();
  const expectedIndex = new Map(expectedOrder.map((name, index) => [name, index]));
  const seenNames = new Set();
  const seenIdentities = new Set();
  let previousIndex = -1;

  for (const row of rows) {
    const current = expected[row.migrationName];
    if (current) {
      if (seenNames.has(row.migrationName) || seenIdentities.has(row.migrationName)) {
        throw new Error(`[migration-history] duplicate applied migration identity ${row.migrationName}; deployment is paused`);
      }
      const index = expectedIndex.get(row.migrationName);
      if (index === undefined || index < previousIndex) {
        throw new Error(`[migration-history] reordered applied migration ${row.migrationName}; deployment is paused`);
      }
      previousIndex = index;
      seenNames.add(row.migrationName);
      seenIdentities.add(row.migrationName);
      if (current !== row.checksum) {
        throw new Error(`[migration-history] checksum mismatch for applied migration ${row.migrationName}; immutable history is paused`);
      }
      if (!row.finishedAt || row.rolledBackAt !== null) {
        throw new Error(`[migration-history] unfinished or rolled-back migration ${row.migrationName}; deployment is paused`);
      }
      continue;
    }

    const approved = compatibility.approved?.[row.migrationName];
    if (approved && approved.checksum === row.checksum && expected[approved.replacement]) {
      if (seenNames.has(row.migrationName) || seenIdentities.has(approved.replacement)) {
        throw new Error(`[migration-history] duplicate applied migration identity ${row.migrationName}; deployment is paused`);
      }
      const index = expectedIndex.get(approved.replacement);
      if (index === undefined || index < previousIndex) {
        throw new Error(`[migration-history] reordered applied migration ${row.migrationName}; deployment is paused`);
      }
      previousIndex = index;
      seenNames.add(row.migrationName);
      seenIdentities.add(approved.replacement);
      if (!row.finishedAt || row.rolledBackAt !== null) {
        throw new Error(`[migration-history] unfinished or rolled-back compatibility migration ${row.migrationName}; deployment is paused`);
      }
      continue;
    }

    throw new Error(`[migration-history] unknown applied migration ${row.migrationName}; deployment is paused for compatibility reconciliation`);
  }
}

// Deterministic libpq-equivalent sslmode mapping. Unknown values pause the
// deployment instead of guessing a weaker or stronger TLS posture.
export function pgSslConfig(rawUrl) {
  const url = new URL(rawUrl);
  const sslMode = url.searchParams.get('sslmode');
  switch (sslMode) {
    case null:
    case 'disable':
      return false;
    case 'allow':
    case 'prefer':
    case 'require':
      // libpq's require encrypts without certificate verification.
      return { rejectUnauthorized: false };
    case 'verify-ca':
    case 'verify-full':
      return { rejectUnauthorized: true };
    default:
      throw new Error(`[migration-history] unsupported sslmode ${sslMode}; deployment is paused`);
  }
}

function requirePg() {
  // Resolve pg from the web workspace, where it is a declared dependency.
  const requireFromWeb = createRequire(pathToFileURL(join(repoRoot, 'apps/web/package.json')));
  return requireFromWeb('pg');
}

export const MIGRATION_HISTORY_CONNECT_TIMEOUT_MS = 10_000;
export const MIGRATION_HISTORY_QUERY_TIMEOUT_MS = 30_000;

/** Build the bounded node-postgres configuration used by the pre-deploy gate. */
export function migrationHistoryClientConfig(databaseUrl) {
  if (!databaseUrl) throw new Error('[migration-history] database authority URL is required');
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ssl: pgSslConfig(databaseUrl),
    connectionTimeoutMillis: MIGRATION_HISTORY_CONNECT_TIMEOUT_MS,
    statement_timeout: MIGRATION_HISTORY_QUERY_TIMEOUT_MS,
    query_timeout: MIGRATION_HISTORY_QUERY_TIMEOUT_MS,
  };
}

export async function checkDatabaseMigrationHistory(databaseUrl, options = {}) {
  const config = migrationHistoryClientConfig(databaseUrl);
  const client = options.createClient
    ? options.createClient(config)
    : new (requirePg().Client)(config);
  await client.connect();
  try {
    const existsResult = await client.query(
      "SELECT to_regclass('public._prisma_migrations')::text AS ledger"
    );
    if (!existsResult.rows[0]?.ledger) return { status: 'empty', checked: 0 };

    const historyResult = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY COALESCE(finished_at, started_at), migration_name'
    );
    const rows = historyResult.rows.map((row) => ({
      migrationName: row.migration_name,
      checksum: row.checksum,
      finishedAt: row.finished_at ?? null,
      rolledBackAt: row.rolled_back_at ?? null,
    }));
    const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
    const expected = currentMigrationChecksums();
    assertUniqueMigrationPrefixes(expected, compatibility);
    assertMigrationHistory(rows, expected, compatibility);
    return { status: 'verified', checked: rows.length };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = await checkDatabaseMigrationHistory(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL);
  console.log(`[migration-history] ${result.status}; checked=${result.checked}`);
}
