import test from 'node:test';
import assert from 'node:assert/strict';

import { assertMigrationHistory, parseMigrationRows } from './check-migration-history.mjs';

test('migration history parser handles empty and tab-separated rows', () => {
  assert.deepEqual(parseMigrationRows(''), []);
  assert.deepEqual(parseMigrationRows('old_name\tabc123\n'), [{ migrationName: 'old_name', checksum: 'abc123' }]);
});

test('migration history fails closed on modified, unknown, and safe compatibility records', () => {
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'known', checksum: 'wrong' }], { known: 'right' },
  ), /checksum mismatch.*immutable history is paused/);
  assert.throws(() => assertMigrationHistory(
    [{ migrationName: 'deleted', checksum: 'old' }], { known: 'right' },
  ), /unknown applied migration.*deployment is paused/);
  assert.doesNotThrow(() => assertMigrationHistory(
    [{ migrationName: 'renamed', checksum: 'old' }],
    { replacement: 'old' },
    { approved: { renamed: { replacement: 'replacement', checksum: 'old' } } },
  ));
});
