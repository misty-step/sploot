import { Prisma, type PrismaClient } from '@prisma/client';
import type { MigrationStatus } from './migration';
import { createHash } from 'node:crypto';
import { bodyToBuffer, ObjectNotFoundError, ObjectParityError, type ObjectStore } from './object-store';
import type { MigrationManifestEntry } from './migration';

export interface DurableMigrationClaim {
  id: string;
  logicalKey: string;
  sourceKey: string;
  rendition: string;
  sourceProvider: string;
  size: number;
  sha256: string;
  contentType: string | null;
  attempts: number;
  leaseGeneration: number;
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Claim bounded migration work with PostgreSQL row locking. The lease and
 * generation are both required on finish, so an expired worker cannot mutate
 * a row after a successor has reclaimed it.
 */
export async function claimMigrationEntries(
  db: Db,
  options: { workerId: string; limit: number; leaseSeconds?: number; maxAttempts?: number },
): Promise<DurableMigrationClaim[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit), 1), 100);
  const leaseSeconds = Math.min(Math.max(Math.trunc(options.leaseSeconds ?? 60), 1), 3600);
  const maxAttempts = Math.min(Math.max(Math.trunc(options.maxAttempts ?? 3), 1), 10);
  await db.storageMigrationEntry.updateMany({
    where: {
      status: 'copying',
      attempts: { gte: maxAttempts },
      leaseExpiresAt: { lte: new Date() },
    },
    data: {
      status: 'failed',
      workerId: null,
      leaseExpiresAt: null,
      lastError: 'Migration lease expired after maximum attempts',
    },
  });
  return db.$queryRaw<DurableMigrationClaim[]>(Prisma.sql`
    WITH candidates AS (
      SELECT id
      FROM "storage_migration_entries"
      WHERE (
        "status" = 'pending'
        OR ("status" = 'failed' AND "attempts" < ${maxAttempts})
        OR ("status" = 'copying' AND "attempts" < ${maxAttempts})
      )
      AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= NOW())
      ORDER BY "logical_key" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "storage_migration_entries" entry
    SET
      "status" = 'copying',
      "worker_id" = ${options.workerId},
      "lease_expires_at" = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
      "lease_generation" = entry."lease_generation" + 1,
      "attempts" = entry."attempts" + 1,
      "updated_at" = NOW()
    FROM candidates
    WHERE entry.id = candidates.id
    RETURNING
      entry.id,
      entry."logical_key" AS "logicalKey",
      entry."source_key" AS "sourceKey",
      entry."rendition" AS "rendition",
      entry."source_provider" AS "sourceProvider",
      entry.size,
      entry.sha256,
      entry."content_type" AS "contentType",
      entry.attempts,
      entry."lease_generation" AS "leaseGeneration"
  `);
}

export async function finishMigrationEntry(
  db: Db,
  claim: Pick<DurableMigrationClaim, 'id' | 'leaseGeneration'>,
  workerId: string,
  status: Extract<MigrationStatus, 'verified' | 'missing' | 'failed' | 'rolled_back'>,
  error?: string,
): Promise<boolean> {
  const result = await db.storageMigrationEntry.updateMany({
    where: {
      id: claim.id,
      status: 'copying',
      workerId,
      leaseGeneration: claim.leaseGeneration,
      leaseExpiresAt: { gt: new Date() },
    },
    data: {
      status,
      workerId: null,
      leaseExpiresAt: null,
      lastError: error ?? null,
      ...(status === 'verified' ? { verifiedAt: new Date() } : {}),
      ...(status === 'rolled_back' ? { rolledBackAt: new Date() } : {}),
    },
  });
  return result.count === 1;
}

export async function storageMigrationReceipt(db: Db) {
  const entries = await db.storageMigrationEntry.findMany({ orderBy: { logicalKey: 'asc' } });
  const counts = Object.fromEntries([...new Set(entries.map(entry => entry.status))].map(status => [status, entries.filter(entry => entry.status === status).length]));
  return { entries, counts, verified: counts.verified ?? 0, missing: counts.missing ?? 0, failed: counts.failed ?? 0, rolledBack: counts.rolled_back ?? 0 };
}

export async function seedMigrationManifest(
  db: Db,
  entries: MigrationManifestEntry[],
  providers: { source: string; target: string },
): Promise<void> {
  for (const entry of entries) {
    const existing = await db.storageMigrationEntry.findUnique({ where: { logicalKey: entry.logicalKey } });
    if (existing) {
      if (existing.size !== entry.size || existing.sha256 !== entry.sha256 || existing.sourceKey !== entry.sourceKey || existing.rendition !== (entry.rendition ?? 'original') || existing.sourceProvider !== (entry.sourceProvider ?? providers.source)) {
        throw new Error(`Manifest changed for existing migration key ${entry.logicalKey}`);
      }
      continue;
    }
    await db.storageMigrationEntry.create({
      data: {
        logicalKey: entry.logicalKey,
        rendition: entry.rendition ?? 'original',
        sourceProvider: entry.sourceProvider ?? providers.source,
        sourceKey: entry.sourceKey,
        targetProvider: providers.target,
        targetKey: entry.logicalKey,
        size: entry.size,
        sha256: entry.sha256,
        contentType: entry.contentType,
      },
    });
  }
}

export async function runPrismaMigrationBatch(
  db: Db,
  options: { source: ObjectStore; target: ObjectStore; workerId: string; limit?: number; maxAttempts?: number },
) {
  const claims = await claimMigrationEntries(db, { workerId: options.workerId, limit: options.limit ?? 100, maxAttempts: options.maxAttempts });
  for (const claim of claims) {
    try {
      let bytes: Buffer;
      try {
        const existing = await options.target.get(claim.logicalKey);
        bytes = await bodyToBuffer(existing.body, Math.max(claim.size, 1));
        assertClaimBytes(bytes, claim);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError) && !(error instanceof ObjectParityError)) throw error;
        const source = options.source.getSourceKey ? await options.source.getSourceKey(claim.sourceKey) : await options.source.get(claim.sourceKey);
        bytes = await bodyToBuffer(source.body, Math.max(claim.size, 1));
        assertClaimBytes(bytes, claim);
        await options.target.put(claim.logicalKey, bytes, { size: claim.size, sha256: claim.sha256, contentType: claim.contentType ?? undefined });
        const readback = await options.target.get(claim.logicalKey);
        const readbackBytes = await bodyToBuffer(readback.body, Math.max(claim.size, 1));
        assertClaimBytes(readbackBytes, claim);
      }
      if (!await finishMigrationEntry(db, claim, options.workerId, 'verified')) throw new Error(`Migration lease lost for ${claim.logicalKey}`);
    } catch (error) {
      const status = error instanceof ObjectNotFoundError ? 'missing' : 'failed';
      await finishMigrationEntry(db, claim, options.workerId, status, error instanceof Error ? error.message : String(error));
    }
  }
  return storageMigrationReceipt(db);
}

export async function rollbackPrismaMigrationBatch(
  db: Db,
  options: { source: ObjectStore; target: ObjectStore; workerId: string; limit?: number },
) {
  const claims = await db.$queryRaw<DurableMigrationClaim[]>(Prisma.sql`
    WITH candidates AS (
      SELECT id FROM "storage_migration_entries"
      WHERE (
        "status" = 'verified'
        OR ("status" = 'copying' AND "lease_expires_at" <= NOW())
      )
        AND ("lease_expires_at" IS NULL OR "lease_expires_at" <= NOW())
      ORDER BY "logical_key" ASC LIMIT ${Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 100)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "storage_migration_entries" entry
    SET "status" = 'copying', "worker_id" = ${options.workerId},
        "lease_expires_at" = NOW() + INTERVAL '1 minute',
        "lease_generation" = entry."lease_generation" + 1, "updated_at" = NOW()
    FROM candidates WHERE entry.id = candidates.id
    RETURNING entry.id, entry."logical_key" AS "logicalKey", entry."source_key" AS "sourceKey",
      entry."rendition" AS "rendition", entry."source_provider" AS "sourceProvider",
      entry.size, entry.sha256, entry."content_type" AS "contentType", entry.attempts,
      entry."lease_generation" AS "leaseGeneration"
  `);
  for (const claim of claims) {
    try {
      const source = options.source.getSourceKey ? await options.source.getSourceKey(claim.sourceKey) : await options.source.get(claim.sourceKey);
      const sourceBytes = await bodyToBuffer(source.body, Math.max(claim.size, 1));
      assertClaimBytes(sourceBytes, claim);
      assertClaimMime(source.metadata.contentType, claim.contentType);
      const target = await options.target.get(claim.logicalKey);
      const targetBytes = await bodyToBuffer(target.body, Math.max(claim.size, 1));
      assertClaimBytes(targetBytes, claim);
      assertClaimMime(target.metadata.contentType, claim.contentType);
      await options.target.delete(claim.logicalKey);
      await options.target.get(claim.logicalKey).then(() => { throw new Error(`Rollback delete readback still exists for ${claim.logicalKey}`); }).catch(error => {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      });
      if (!await finishMigrationEntry(db, claim, options.workerId, 'rolled_back')) throw new Error(`Rollback lease lost for ${claim.logicalKey}`);
    } catch (error) {
      await finishMigrationEntry(db, claim, options.workerId, 'failed', error instanceof Error ? error.message : String(error));
    }
  }
  return storageMigrationReceipt(db);
}

function assertClaimMime(actual: string | undefined, expected: string | null) {
  if (expected && actual && actual.toLowerCase().split(';')[0].trim() !== expected.toLowerCase().split(';')[0].trim()) throw new ObjectParityError(`Migration content type mismatch: expected ${expected}, got ${actual}`);
  if (expected && !actual) throw new ObjectParityError(`Migration content type missing: expected ${expected}`);
}

function assertClaimBytes(bytes: Buffer, claim: Pick<DurableMigrationClaim, 'logicalKey' | 'size' | 'sha256'>) {
  if (bytes.byteLength !== claim.size) throw new ObjectParityError(`Migration size mismatch for ${claim.logicalKey}`);
  if (createHash('sha256').update(bytes).digest('hex') !== claim.sha256) throw new ObjectParityError(`Migration SHA-256 mismatch for ${claim.logicalKey}`);
}
