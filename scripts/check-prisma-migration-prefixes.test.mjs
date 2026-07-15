import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUniqueMigrationPrefixes, LEGACY_DUPLICATES } from './check-prisma-migration-prefixes.mjs';

test('rejects a new duplicate 14-digit migration prefix', () => {
  assert.throws(
    () => assertUniqueMigrationPrefixes([
      '20260715120000_index_upload_receipt_processing_sweep',
      '20260715120000_other_new_migration',
    ]),
    /Duplicate Prisma migration timestamp prefix 20260715120000/,
  );
});

test('rejects mutation or expansion of the immutable legacy allowlist', () => {
  const legacy = [...LEGACY_DUPLICATES.get('20260714000000')];
  assert.throws(
    () => assertUniqueMigrationPrefixes([...legacy, '20260714000000_mutated_new_migration']),
    /Duplicate Prisma migration timestamp prefix 20260714000000/,
  );
  assert.throws(
    () => assertUniqueMigrationPrefixes([legacy[0], '20260714000000_mutated_replacement']),
    /Duplicate Prisma migration timestamp prefix 20260714000000/,
  );
  assert.throws(
    () => assertUniqueMigrationPrefixes([legacy[0]]),
    /Duplicate Prisma migration timestamp prefix 20260714000000/,
  );
  assert.throws(
    () => assertUniqueMigrationPrefixes([legacy[0], legacy[0]]),
    /Duplicate Prisma migration timestamp prefix 20260714000000/,
  );
});
