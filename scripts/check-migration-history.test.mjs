import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertMigrationHistory,
  assertUniqueMigrationPrefixes,
  checkDatabaseMigrationHistory,
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
