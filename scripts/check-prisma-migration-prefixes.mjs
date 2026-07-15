import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// These two applied migrations predate the assertion and share a legacy
// prefix. Their exact names remain pinned; every other timestamp prefix must
// be unique so Prisma's ordering cannot become ambiguous.
export const LEGACY_DUPLICATES = new Map([
  ['20260714000000', new Set(['20260714000000_add_enrollment_relation_fks', '20260714000000_add_stripe_cancellation_ledger'])],
]);

export function assertUniqueMigrationPrefixes(migrations) {
  const byPrefix = new Map();
  for (const migration of migrations) {
    const match = migration.match(/^(\d{8,14})_/);
    if (!match) continue;
    const prefix = match[1];
    // Legacy migrations used date-only prefixes. They cannot collide with a
    // newly allocated 14-digit Prisma timestamp and are retained as applied.
    if (prefix.length < 14) continue;
    const names = byPrefix.get(prefix) ?? [];
    names.push(migration);
    byPrefix.set(prefix, names);
  }

  for (const [prefix, names] of byPrefix) {
    const allowed = LEGACY_DUPLICATES.get(prefix);
    if (allowed) {
      if (new Set(names).size !== names.length || names.length !== allowed.size || names.some((name) => !allowed.has(name))) {
        throw new Error(`Duplicate Prisma migration timestamp prefix ${prefix}: ${names.join(', ')}`);
      }
      continue;
    }
    if (names.length > 1) {
      throw new Error(`Duplicate Prisma migration timestamp prefix ${prefix}: ${names.join(', ')}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const migrationsRoot = resolve(process.cwd(), 'apps/web/prisma/migrations');
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assertUniqueMigrationPrefixes(migrations);
  console.log(`Prisma migration timestamp prefixes PASS (${migrations.length} directories)`);
}
