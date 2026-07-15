import test from 'node:test';
import assert from 'node:assert/strict';

import { assertMigrationHistory, assertUniqueMigrationPrefixes, parseMigrationRows } from './check-migration-history.mjs';

test('migration history parser handles empty and tab-separated rows', () => {
  assert.deepEqual(parseMigrationRows(''), []);
  assert.deepEqual(parseMigrationRows('old_name\tabc123\t2026-07-15 00:00:00+00\t\n'), [{
    migrationName: 'old_name', checksum: 'abc123', finishedAt: '2026-07-15 00:00:00+00', rolledBackAt: null,
  }]);
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
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'known', checksum: 'right', finishedAt: 'done', rolledBackAt: 'rolled back' }], { known: 'right' },
  ), /rolled-back.*deployment is paused/);
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
