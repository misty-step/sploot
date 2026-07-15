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
    const [migrationName, checksum] = line.split('\t');
    return { migrationName, checksum };
  });
}

export function assertMigrationHistory(rows, expected, compatibility = { approved: {} }) {
  for (const row of rows) {
    const current = expected[row.migrationName];
    if (current) {
      if (current !== row.checksum) {
        throw new Error(`[migration-history] checksum mismatch for applied migration ${row.migrationName}; immutable history is paused`);
      }
      continue;
    }

    const approved = compatibility.approved?.[row.migrationName];
    if (approved && approved.checksum === row.checksum && expected[approved.replacement]) continue;

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
    'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at, migration_name',
  ], options));
  const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
  assertMigrationHistory(rows, currentMigrationChecksums(), compatibility);
  return { status: 'verified', checked: rows.length };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
  const result = checkDatabaseMigrationHistory(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL);
  console.log(`[migration-history] ${result.status}; checked=${result.checked}`);
}
