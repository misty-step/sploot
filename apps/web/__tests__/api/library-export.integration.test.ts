import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  cancelExport,
  createOrReuseExport,
  getOwnedExport,
  recordPartOutcome,
} from '@/lib/export/export-service';

/**
 * Database-backed integration tests for library export persistence: the
 * snapshot predicate, the partial-unique active constraint, and the atomic
 * jsonb part-outcome bookkeeping. Requires DATABASE_URL (CI runs these
 * against pgvector/pgvector:pg15); they skip honestly when absent.
 */

const OWNER = 'export-int-owner';
const OTHER = 'export-int-other';
const BLOB_HOST = 'https://export-int.public.blob.vercel-storage.com';

// Probe reachability, not just configuration: vitest.setup.ts always sets a
// default DATABASE_URL, so `prisma` is non-null even when no server exists.
let dbAvailable = false;
if (prisma) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function cleanup() {
  await prisma!.libraryExport.deleteMany({ where: { ownerUserId: { in: [OWNER, OTHER] } } });
  await prisma!.asset.deleteMany({ where: { ownerUserId: { in: [OWNER, OTHER] } } });
  await prisma!.user.deleteMany({ where: { id: { in: [OWNER, OTHER] } } });
}

async function seedUserWithAssets() {
  await prisma!.user.createMany({
    data: [
      { id: OWNER, email: `${OWNER}@example.com` },
      { id: OTHER, email: `${OTHER}@example.com` },
    ],
    skipDuplicates: true,
  });

  const bytes = new Uint8Array([1, 2, 3, 4]);
  await prisma!.asset.createMany({
    data: [
      {
        id: 'export-int-asset-1',
        ownerUserId: OWNER,
        blobUrl: `${BLOB_HOST}/${OWNER}/a1.png`,
        pathname: `${OWNER}/a1.png`,
        mime: 'image/png',
        size: bytes.length,
        checksumSha256: sha256Hex(bytes),
      },
      {
        id: 'export-int-asset-2',
        ownerUserId: OWNER,
        blobUrl: `${BLOB_HOST}/${OWNER}/a2.png`,
        pathname: `${OWNER}/a2.png`,
        mime: 'image/png',
        size: 10,
        checksumSha256: sha256Hex(new Uint8Array([9])),
      },
      // Soft-deleted before any snapshot: must never appear in an export.
      {
        id: 'export-int-asset-del',
        ownerUserId: OWNER,
        blobUrl: `${BLOB_HOST}/${OWNER}/del.png`,
        pathname: `${OWNER}/del.png`,
        mime: 'image/png',
        size: 5,
        checksumSha256: sha256Hex(new Uint8Array([5])),
        deletedAt: new Date(Date.now() - 60_000),
      },
      // Another tenant's asset: must never leak.
      {
        id: 'export-int-asset-other',
        ownerUserId: OTHER,
        blobUrl: `${BLOB_HOST}/${OTHER}/x.png`,
        pathname: `${OTHER}/x.png`,
        mime: 'image/png',
        size: 7,
        checksumSha256: sha256Hex(new Uint8Array([7])),
      },
    ],
  });
}

describe.skipIf(!dbAvailable)('library export persistence (DB)', () => {
  beforeAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await seedUserWithAssets();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates a tenant-scoped snapshot and reuses the active export', async () => {
    const { export: created, reused } = await createOrReuseExport(OWNER);
    expect(reused).toBe(false);
    expect(created.totals.assets).toBe(2);
    expect(created.totals.originalBytes).toBe(14);
    expect(created.partCount).toBe(1);

    const { export: again, reused: reusedAgain } = await createOrReuseExport(OWNER);
    expect(reusedAgain).toBe(true);
    expect(again.id).toBe(created.id);
  });

  it('force supersedes and keeps at most one active export per user', async () => {
    const { export: first } = await createOrReuseExport(OWNER);
    const { export: second, reused } = await createOrReuseExport(OWNER, { force: true });
    expect(reused).toBe(false);
    expect(second.id).not.toBe(first.id);

    const actives = await prisma!.libraryExport.findMany({
      where: { ownerUserId: OWNER, status: 'active' },
    });
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe(second.id);
  });

  it('records part outcomes atomically: served, failures, egress — and clears failures on a clean retry', async () => {
    const { export: created } = await createOrReuseExport(OWNER);

    await recordPartOutcome(created.id, 0, [
      { assetId: 'export-int-asset-1', archivePath: 'assets/export-int-asset-1.png', reason: 'object_missing' },
    ], 123);

    let row = await getOwnedExport(OWNER, created.id);
    expect(row).not.toBeNull();
    expect(row!.servedParts).toEqual([0]);
    expect(row!.failures).toEqual({
      '0': [{ assetId: 'export-int-asset-1', archivePath: 'assets/export-int-asset-1.png', reason: 'object_missing' }],
    });
    expect(row!.egressBytes).toBe(BigInt(123));

    // Serving the same part again must not duplicate the served marker,
    // and a clean retry clears the previously recorded failures.
    await recordPartOutcome(created.id, 0, [], 50);
    row = await getOwnedExport(OWNER, created.id);
    expect(row!.servedParts).toEqual([0]);
    expect(row!.failures).toEqual({ '0': [] });
    expect(row!.egressBytes).toBe(BigInt(173));
  });

  it('cancel is tenant-scoped and terminal', async () => {
    const { export: created } = await createOrReuseExport(OWNER);
    expect(await cancelExport(OTHER, created.id)).toBe(false);
    expect(await cancelExport(OWNER, created.id)).toBe(true);

    const row = await getOwnedExport(OWNER, created.id);
    expect(row!.status).toBe('canceled');
  });
});
