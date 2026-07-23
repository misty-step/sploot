import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assertMigrationHistory,
  assertUniqueMigrationPrefixes,
  checkDatabaseMigrationHistory,
  currentMigrationChecksums,
  MIGRATION_HISTORY_CONNECT_TIMEOUT_MS,
  MIGRATION_HISTORY_QUERY_TIMEOUT_MS,
  migrationHistoryClientConfig,
  pgSslConfig,
} from './check-migration-history.mjs';

test('sslmode maps deterministically onto the pg client and pauses on unknown modes', () => {
  assert.equal(pgSslConfig('postgresql://u@host/db?sslmode=disable'), false);
  assert.equal(pgSslConfig('postgresql://u@host/db'), false);
  assert.deepEqual(pgSslConfig('postgresql://u@host/db?sslmode=require'), { rejectUnauthorized: false });
  assert.deepEqual(pgSslConfig('postgresql://u@host/db?sslmode=verify-full'), { rejectUnauthorized: true });
  assert.throws(() => pgSslConfig('postgresql://u@host/db?sslmode=mystery'), /unsupported sslmode/);
});

test('migration history client config bounds connect and query work', () => {
  assert.deepEqual(migrationHistoryClientConfig('postgresql://u:p@host:6543/db?sslmode=require'), {
    host: 'host',
    port: 6543,
    user: 'u',
    password: 'p',
    database: 'db',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: MIGRATION_HISTORY_CONNECT_TIMEOUT_MS,
    statement_timeout: MIGRATION_HISTORY_QUERY_TIMEOUT_MS,
    query_timeout: MIGRATION_HISTORY_QUERY_TIMEOUT_MS,
  });
  assert.equal(MIGRATION_HISTORY_CONNECT_TIMEOUT_MS, 10_000);
  assert.equal(MIGRATION_HISTORY_QUERY_TIMEOUT_MS, 30_000);
});

test('migration history fails closed on connect and query timeout errors', async () => {
  let connectConfig;
  let queryCalls = 0;
  await assert.rejects(
    checkDatabaseMigrationHistory('postgresql://u:p@host/db', {
      createClient: (config) => {
        connectConfig = config;
        return {
          connect: async () => { throw new Error('connect timeout'); },
          query: async () => { queryCalls += 1; return { rows: [] }; },
          end: async () => { throw new Error('end must not run after connect failure'); },
        };
      },
    }),
    /connect timeout/,
  );
  assert.equal(connectConfig.connectionTimeoutMillis, MIGRATION_HISTORY_CONNECT_TIMEOUT_MS);
  assert.equal(queryCalls, 0);

  let ended = 0;
  queryCalls = 0;
  await assert.rejects(
    checkDatabaseMigrationHistory('postgresql://u:p@host/db', {
      createClient: (config) => {
        assert.equal(config.statement_timeout, MIGRATION_HISTORY_QUERY_TIMEOUT_MS);
        assert.equal(config.query_timeout, MIGRATION_HISTORY_QUERY_TIMEOUT_MS);
        return {
          connect: async () => {},
          query: async () => {
            queryCalls += 1;
            if (queryCalls === 1) return { rows: [{ ledger: 'public._prisma_migrations' }] };
            throw new Error('statement timeout');
          },
          end: async () => { ended += 1; },
        };
      },
    }),
    /statement timeout/,
  );
  assert.equal(ended, 1);
});

test('migration history fails closed on modified, unknown, and safe compatibility records', () => {
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'known', checksum: 'wrong' }], { known: 'right' },
  ), /checksum mismatch.*immutable history is paused/);
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'deleted', checksum: 'old' }], { known: 'right' },
  ), /unknown applied migration.*deployment is paused/);
  assert.doesNotThrow(() => assertMigrationHistory(
    [{ migrationName: 'renamed', checksum: 'old', finishedAt: 'done', rolledBackAt: null }],
    { replacement: 'old' },
    { approved: { renamed: { replacement: 'replacement', checksum: 'old' } } },
  ));
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'known', checksum: 'right', finishedAt: null, rolledBackAt: null }], { known: 'right' },
  ), /unfinished.*deployment is paused/);
  assert.doesNotThrow(() => assertMigrationHistory([
    { migrationName: 'known', checksum: 'old-failed-attempt', finishedAt: null, rolledBackAt: 'resolved' },
    { migrationName: 'known', checksum: 'right', finishedAt: 'done', rolledBackAt: null },
    { migrationName: 'known', checksum: 'older-failed-attempt', finishedAt: null, rolledBackAt: 'resolved' },
  ], { known: 'right' }));
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'known', checksum: 'right', finishedAt: 'done', rolledBackAt: 'rolled back' }], { known: 'right' },
  ), /finished and rolled-back.*deployment is paused/);
});

test('migration history rejects duplicate and reordered finished rows', () => {
  const expected = { first: 'one', second: 'two', third: 'three' };
  const finished = { finishedAt: 'done', rolledBackAt: null };
  assert.throws(() => assertMigrationHistory([
    { migrationName: 'first', checksum: 'one', ...finished },
    { migrationName: 'first', checksum: 'one', ...finished },
  ], expected), /duplicate applied migration/);
  assert.throws(() => assertMigrationHistory([
    { migrationName: 'second', checksum: 'two', ...finished },
    { migrationName: 'first', checksum: 'one', ...finished },
  ], expected), /reordered applied migration/);
  assert.throws(() => assertMigrationHistory([
    { migrationName: 'first', checksum: 'one', ...finished },
    { migrationName: 'renamed-second', checksum: 'two', ...finished },
    { migrationName: 'second', checksum: 'two', ...finished },
  ], expected, {
    approved: { 'renamed-second': { replacement: 'second', checksum: 'two' } },
  }), /duplicate applied migration identity/);
});

test('duplicate prefixes require explicit identities and authority', () => {
  const expected = {
    '20260518_add_asset_shuffle_key': 'one',
    '20260518_add_storage_quota': 'two',
  };
  assert.throws(() => assertUniqueMigrationPrefixes(expected), /duplicate migration prefix/);
  assert.doesNotThrow(() => assertUniqueMigrationPrefixes(expected, {
    prefixExceptions: [{
      prefix: '20260518',
      migrationNames: Object.keys(expected),
      authority: 'historical Prisma migration identities are distinct by full directory name',
    }],
  }));
  assert.throws(() => assertUniqueMigrationPrefixes({
    ...expected,
    '20260518_other_identity': 'three',
  }, {
    prefixExceptions: [{
      prefix: '20260518',
      migrationNames: Object.keys(expected),
      authority: 'historical identity',
    }],
  }), /does not match repository migration identities/);
});

test('regression 2026-07-23: the checked-in compatibility rename resolves the production reordering incident', () => {
  // Production incident: apps/web/prisma/migrations/20260714045000_add_upload_idempotency
  // was authored and named while a July 15-17 batch (ending in
  // 20260717021000_backfill_asset_embedding_owner_visibility) was still
  // unmerged. It landed and was first applied to production on 2026-07-23,
  // long after that batch, but its own July-14 timestamp lexicographically
  // sorts BEFORE it -- the immutable-history gate correctly rejected the
  // resulting reordering. The fix renamed the folder to
  // 20260715075000_add_upload_idempotency (the first free slot between the
  // already-applied 070000 and the still-pending 080000) and recorded the
  // rename in migration-history-compatibility.json under the OLD name, so
  // production's existing applied row (which still carries the old name)
  // resolves through the compatibility map instead of failing forever.
  const expected = currentMigrationChecksums();
  const compatibilityPath = fileURLToPath(new URL('../apps/web/prisma/migration-history-compatibility.json', import.meta.url));
  const compatibility = JSON.parse(readFileSync(compatibilityPath, 'utf8'));
  const oldName = '20260714045000_add_upload_idempotency';
  const approved = compatibility.approved[oldName];
  assert.ok(approved, 'expected an approved rename entry for the old migration name');
  assert.ok(expected[approved.replacement], 'replacement must be a real, currently-declared migration');
  assert.ok(!expected[oldName], 'the old name must no longer exist as its own migration folder');

  // Every already-applied migration up to and including the July 15-17
  // batch, in the exact chronological order production actually recorded
  // them, plus the renamed migration's OLD name/checksum where it truly
  // landed in that order (first among everything finished on 2026-07-23,
  // by raw string sort of the old name against its same-instant peers).
  const finished = { finishedAt: 'done', rolledBackAt: null };
  const priorBatch = Object.keys(expected)
    .filter((name) => name <= '20260715070000_harden_terminal_revival_exit')
    .sort();
  const rows = [
    ...priorBatch.map((migrationName) => ({ migrationName, checksum: expected[migrationName], ...finished })),
    { migrationName: oldName, checksum: approved.checksum, ...finished },
    { migrationName: '20260715080000_add_library_exports', checksum: expected['20260715080000_add_library_exports'], ...finished },
    { migrationName: '20260717021000_backfill_asset_embedding_owner_visibility', checksum: expected['20260717021000_backfill_asset_embedding_owner_visibility'], ...finished },
  ];
  assert.doesNotThrow(() => assertMigrationHistory(rows, expected, compatibility));
});
