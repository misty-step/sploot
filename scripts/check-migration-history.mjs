#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const migrationRoot = resolve(repoRoot, 'apps/web/prisma/migrations');
const compatibilityPath = resolve(repoRoot, 'apps/web/prisma/migration-history-compatibility.json');

export function currentMigrationChecksums(root = migrationRoot) {
  return Object.fromEntries(readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sql = readFileSync(join(root, entry.name, 'migration.sql'));
      return [entry.name, createHash('sha256').update(sql).digest('hex')];
    }));
}

export function parseMigrationRows(output) {
  return output.trim() === '' ? [] : output.trim().split('\n').map((line) => {
    const [migrationName, checksum, finishedAt, rolledBackAt] = line.split('\t');
    return {
      migrationName,
      checksum,
      finishedAt: finishedAt || null,
      rolledBackAt: rolledBackAt || null,
    };
  });
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
  for (const row of rows) {
    const current = expected[row.migrationName];
    if (current) {
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
      if (!row.finishedAt || row.rolledBackAt !== null) {
        throw new Error(`[migration-history] unfinished or rolled-back compatibility migration ${row.migrationName}; deployment is paused`);
      }
      continue;
    }

    throw new Error(`[migration-history] unknown applied migration ${row.migrationName}; deployment is paused for compatibility reconciliation`);
  }
}

function psqlEnv(rawUrl, env) {
  const url = new URL(rawUrl);
  return {
    ...env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.get('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
  };
}

export function checkDatabaseMigrationHistory(databaseUrl, env = process.env) {
  if (!databaseUrl) throw new Error('[migration-history] database authority URL is required');
  const options = { env: psqlEnv(databaseUrl, env), encoding: 'utf8' };
  const exists = execFileSync('psql', ['--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', '-c', "SELECT to_regclass('public._prisma_migrations')"], options).trim();
  if (!exists) return { status: 'empty', checked: 0 };

  const rows = parseMigrationRows(execFileSync('psql', [
    '--no-psqlrc', '-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c',
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY COALESCE(finished_at, started_at), migration_name',
  ], options));
  const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
  const expected = currentMigrationChecksums();
  assertUniqueMigrationPrefixes(expected, compatibility);
  assertMigrationHistory(rows, expected, compatibility);
  return { status: 'verified', checked: rows.length };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
  const result = checkDatabaseMigrationHistory(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL);
  console.log(`[migration-history] ${result.status}; checked=${result.checked}`);
}
