import { createHash } from 'node:crypto';
import { acquireEnrollmentIdentityWriterLock } from '@/lib/enrollment/enrollment-policy';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  cancelExport,
  entriesForPart,
  createOrReuseExport,
  ExportEgressWindowExhaustedError,
  getOwnedExport,
  recordPartOutcome,
  refundExportEgress,
  reserveExportEgress,
} from '@/lib/export/export-service';
import {
  exportEgressAllowance,
  exportEgressWindowAllowance,
} from '@/lib/export/export-policy';

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

  it('records part outcomes atomically: served + failures — and clears failures on a clean retry', async () => {
    const { export: created } = await createOrReuseExport(OWNER);

    await recordPartOutcome(created.id, 0, [
      { assetId: 'export-int-asset-1', archivePath: 'assets/export-int-asset-1.png', reason: 'object_missing' },
    ]);

    let row = await getOwnedExport(OWNER, created.id);
    expect(row).not.toBeNull();
    expect(row!.servedParts).toEqual([0]);
    expect(row!.failures).toEqual({
      '0': [{ assetId: 'export-int-asset-1', archivePath: 'assets/export-int-asset-1.png', reason: 'object_missing' }],
    });
    // Egress is charged at admission time, never by outcome bookkeeping.
    expect(row!.egressBytes).toBe(BigInt(0));

    // Serving the same part again must not duplicate the served marker,
    // and a clean retry clears the previously recorded failures.
    await recordPartOutcome(created.id, 0, []);
    row = await getOwnedExport(OWNER, created.id);
    expect(row!.servedParts).toEqual([0]);
    expect(row!.failures).toEqual({ '0': [] });
    expect(row!.egressBytes).toBe(BigInt(0));
  });

  it('serializes concurrent failure cap updates after re-reading under the identity lock', async () => {
    const { export: created } = await createOrReuseExport(OWNER);
    const failure = (part: number, index: number) => ({ assetId: `failure-${part}-${index}`, archivePath: `assets/failure-${part}-${index}.png`, reason: 'object_missing' });
    await prisma!.libraryExport.update({
      where: { id: created.id },
      data: { failures: { '0': Array.from({ length: 8_000 }, (_, index) => failure(0, index)) } },
    });
    const outcomes = await Promise.allSettled([
      recordPartOutcome(created.id, 1, Array.from({ length: 2_000 }, (_, index) => failure(1, index))),
      recordPartOutcome(created.id, 2, Array.from({ length: 2_000 }, (_, index) => failure(2, index))),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const row = (await getOwnedExport(OWNER, created.id))!;
    const total = Object.values(row.failures).reduce((sum, items) => sum + items.length, 0);
    expect(total).toBeLessThanOrEqual(10_000);
  });

  describe('egress reservation under production-shaped concurrency', () => {
    it('concurrent reservations serialize on the row and never collectively exceed the allowance', async () => {
      const { export: created } = await createOrReuseExport(OWNER);
      const row = (await getOwnedExport(OWNER, created.id))!;
      const allowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
      // Pick a reservation size where exactly 3 of 8 concurrent requests fit.
      const reserve = allowance / BigInt(3);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => reserveExportEgress(row, reserve)),
      );
      const admitted = results.filter((result) => result.kind === 'reserved');
      expect(admitted).toHaveLength(3);

      const after = (await getOwnedExport(OWNER, created.id))!;
      expect(after.egressBytes).toBe(reserve * BigInt(3));
      expect(after.egressBytes <= allowance).toBe(true);
    });

    it('admits exactly to the boundary, refuses beyond it, and classifies the refusal', async () => {
      const { export: created } = await createOrReuseExport(OWNER);
      const row = (await getOwnedExport(OWNER, created.id))!;
      const allowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);

      const exact = await reserveExportEgress(row, allowance);
      expect(exact.kind).toBe('reserved');

      const past = await reserveExportEgress(row, BigInt(1));
      expect(past).toEqual({ kind: 'refused', code: 'export_egress_exhausted' });
    });

    it('refunds settle to actual bytes, can never double-apply below zero, and cannot exceed the charge', async () => {
      const { export: created } = await createOrReuseExport(OWNER);
      const row = (await getOwnedExport(OWNER, created.id))!;

      const reserved = BigInt(10_000);
      expect((await reserveExportEgress(row, reserved)).kind).toBe('reserved');
      await refundExportEgress(created.id, reserved - BigInt(1_234));
      let after = (await getOwnedExport(OWNER, created.id))!;
      expect(after.egressBytes).toBe(BigInt(1_234));

      // A refund larger than the remaining charge is refused wholesale rather
      // than driving the counter negative.
      await refundExportEgress(created.id, BigInt(999_999));
      after = (await getOwnedExport(OWNER, created.id))!;
      expect(after.egressBytes).toBe(BigInt(1_234));

      // Zero-byte refunds are a no-op.
      await refundExportEgress(created.id, BigInt(0));
      after = (await getOwnedExport(OWNER, created.id))!;
      expect(after.egressBytes).toBe(BigInt(1_234));
    });

    it('reservation requires a live capability: canceled and expired sessions refuse admission', async () => {
      const { export: created } = await createOrReuseExport(OWNER);
      const row = (await getOwnedExport(OWNER, created.id))!;
      await cancelExport(OWNER, created.id);
      const canceled = await reserveExportEgress(row, BigInt(1));
      expect(canceled.kind).toBe('gone');

      const { export: fresh } = await createOrReuseExport(OWNER, { force: true });
      await prisma!.libraryExport.update({
        where: { id: fresh.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expiredRow = (await getOwnedExport(OWNER, fresh.id))!;
      const expired = await reserveExportEgress(expiredRow, BigInt(1));
      expect(expired.kind).toBe('gone');
    });

    it('force/cancel/supersede cycling is bounded by the rolling tenant window', async () => {
      // Session 1: spend the full per-export allowance, then supersede.
      const { export: first } = await createOrReuseExport(OWNER);
      const firstRow = (await getOwnedExport(OWNER, first.id))!;
      const allowance = exportEgressAllowance(firstRow.totalOriginalBytes, firstRow.totalAssets, firstRow.manifestMetadataBytes);
      expect((await reserveExportEgress(firstRow, allowance)).kind).toBe('reserved');

      // Session 2 (force): window still has exactly one allowance of headroom.
      const { export: second } = await createOrReuseExport(OWNER, { force: true });
      const secondRow = (await getOwnedExport(OWNER, second.id))!;
      expect(exportEgressWindowAllowance(secondRow.totalOriginalBytes, secondRow.totalAssets, secondRow.manifestMetadataBytes)).toBe(
        allowance * BigInt(2),
      );
      expect((await reserveExportEgress(secondRow, allowance)).kind).toBe('reserved');

      // Session 3 (force): the window is fully consumed — no fresh budget.
      const { export: third } = await createOrReuseExport(OWNER, { force: true });
      const thirdRow = (await getOwnedExport(OWNER, third.id))!;
      const refused = await reserveExportEgress(thirdRow, BigInt(1));
      expect(refused).toEqual({ kind: 'refused', code: 'export_egress_window_exhausted' });

      // The bound is a sliding window, not a padlock: once the old sessions
      // age out, admission opens again. Simulate the slide directly.
      await prisma!.$executeRaw`
        UPDATE "library_exports"
        SET "updated_at" = NOW() - INTERVAL '25 hours'
        WHERE "owner_user_id" = ${OWNER} AND "id" <> ${thirdRow.id}
      `;
      const reopened = await reserveExportEgress(thirdRow, BigInt(1));
      expect(reopened.kind).toBe('reserved');
    });
  });



  it('prunes zero-egress force-create spam even while rows are inside the window', async () => {
    await createOrReuseExport(OWNER);
    for (let index = 0; index < 40; index += 1) {
      await createOrReuseExport(OWNER, { force: true });
    }

    const rows = await prisma!.libraryExport.findMany({ where: { ownerUserId: OWNER } });
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1);
    expect(rows.length).toBeLessThanOrEqual(32);
  });

  it('refuses a 33rd protected session and reopens when the earliest window slides', async () => {
    let active = (await createOrReuseExport(OWNER)).export;
    for (let index = 0; index < 31; index += 1) {
      await prisma!.libraryExport.update({
        where: { id: active.id },
        data: { egressBytes: BigInt(1) },
      });
      active = (await createOrReuseExport(OWNER, { force: true })).export;
    }
    await prisma!.libraryExport.update({
      where: { id: active.id },
      data: { egressBytes: BigInt(1) },
    });

    await expect(createOrReuseExport(OWNER, { force: true })).rejects.toBeInstanceOf(
      ExportEgressWindowExhaustedError,
    );
    let rows = await prisma!.libraryExport.findMany({
      where: { ownerUserId: OWNER },
      orderBy: { updatedAt: 'asc' },
    });
    expect(rows).toHaveLength(32);
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1);

    await prisma!.$executeRaw`
      UPDATE "library_exports"
      SET "updated_at" = NOW() - INTERVAL '25 hours'
      WHERE "id" = ${rows[0].id}
    `;
    const reopened = await createOrReuseExport(OWNER, { force: true });
    expect(reopened.reused).toBe(false);
    rows = await prisma!.libraryExport.findMany({ where: { ownerUserId: OWNER } });
    expect(rows.length).toBeLessThanOrEqual(32);
  });

  it('serializes a boundary reservation against force-create without erasing spend', async () => {
    let active = (await createOrReuseExport(OWNER)).export;
    for (let index = 0; index < 31; index += 1) {
      await prisma!.libraryExport.update({
        where: { id: active.id },
        data: { egressBytes: BigInt(1) },
      });
      active = (await createOrReuseExport(OWNER, { force: true })).export;
    }
    const activeRow = (await getOwnedExport(OWNER, active.id))!;

    const [reservation, forceCreate] = await Promise.allSettled([
      reserveExportEgress(activeRow, BigInt(1)),
      createOrReuseExport(OWNER, { force: true }),
    ]);
    if (reservation.status !== 'fulfilled') throw reservation.reason;
    if (forceCreate.status === 'fulfilled') {
      expect(reservation.value.kind).toBe('gone');
    } else {
      expect(forceCreate.reason).toBeInstanceOf(ExportEgressWindowExhaustedError);
      expect(reservation.value.kind).toBe('reserved');
      const retained = await getOwnedExport(OWNER, active.id);
      expect(retained?.egressBytes).toBe(BigInt(1));
    }

    const rows = await prisma!.libraryExport.findMany({ where: { ownerUserId: OWNER } });
    expect(rows.length).toBeLessThanOrEqual(32);
  });

  it('uses the shared identity lock as a create/delete barrier', async () => {
    const { export: initial } = await createOrReuseExport(OWNER);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const blocker = prisma!.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, OWNER);
      await held;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    let settled = false;
    const forceCreate = createOrReuseExport(OWNER, { force: true }).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled).toBe(false);
    release();
    const created = await forceCreate;
    await blocker;
    expect(created.export.id).not.toBe(initial.id);

    await prisma!.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, OWNER);
      await tx.libraryExport.updateMany({ where: { ownerUserId: OWNER, status: 'active' }, data: { status: 'canceled' } });
      await tx.asset.delete({ where: { id: 'export-int-asset-1' } });
    });
    expect((await getOwnedExport(OWNER, created.export.id))!.status).toBe('canceled');
  });

  it('captures part membership under the same lock before delete-first cancellation', async () => {
    const { export: created } = await createOrReuseExport(OWNER);
    const row = (await getOwnedExport(OWNER, created.id))!;
    const captured = await prisma!.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, OWNER);
      const entries = await entriesForPart(row, 0, tx);
      return entries.map((entry) => entry.assetId);
    });
    expect(captured).toEqual(['export-int-asset-1', 'export-int-asset-2']);

    await prisma!.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, OWNER);
      await tx.libraryExport.updateMany({ where: { ownerUserId: OWNER, status: 'active' }, data: { status: 'canceled' } });
      await tx.asset.delete({ where: { id: 'export-int-asset-1' } });
    });
    expect((await getOwnedExport(OWNER, created.id))!.status).toBe('canceled');
  });

  it('cancel is tenant-scoped and terminal', async () => {
    const { export: created } = await createOrReuseExport(OWNER);
    expect(await cancelExport(OTHER, created.id)).toBe(false);
    expect(await cancelExport(OWNER, created.id)).toBe(true);

    const row = await getOwnedExport(OWNER, created.id);
    expect(row!.status).toBe('canceled');
  });
});
