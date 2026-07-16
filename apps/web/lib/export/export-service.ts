import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { acquireEnrollmentIdentityWriterLock } from '@/lib/enrollment/enrollment-policy';
import { estimateManifestEgressBytesForExport } from './export-manifest';
import {
  EXPORT_EGRESS_WINDOW_MS,
  EXPORT_MANIFEST_VERSION,
  EXPORT_SCAN_PAGE_SIZE,
  EXPORT_TTL_MS,
  archivePathFor,
  computeCompleteness,
  exportEgressAllowance,
  exportEgressWindowAllowance,
  flattenFailures,
  isExportExpired,
  partFileName,
  createExportPartPlanner,
  snapshotAssetWhere,
  validateExportPartBoundaries,
  type ExportFailure,
  type ExportFailuresByPart,
  type ExportPartBoundary,
} from './export-policy';
import type { ExportZipEntry } from './export-zip';

/**
 * Persistence and orchestration for complete-library exports.
 *
 * Deliberately gate-free beyond enrollment: this module never consults
 * storage quota, billing state, or runtime upload gates. Per VISION.md,
 * limits and billing failure never remove read/export/delete access.
 *
 * At most one `active` export exists per user (partial unique index
 * `library_exports_one_active_per_user`); concurrent creates race safely —
 * the loser adopts the winner's row.
 */

export type LibraryExportStatus = 'active' | 'superseded' | 'canceled';

export interface ExportRowData {
  id: string;
  ownerUserId: string;
  status: LibraryExportStatus;
  snapshotAt: Date;
  expiresAt: Date;
  manifestVersion: string;
  totalAssets: number;
  totalOriginalBytes: bigint;
  partBoundaries: ExportPartBoundary[];
  servedParts: number[];
  failures: ExportFailuresByPart;
  egressBytes: bigint;
  manifestMetadataBytes: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryExportView {
  id: string;
  status: LibraryExportStatus | 'expired';
  createdAt: string;
  snapshotAt: string;
  expiresAt: string;
  manifestVersion: string;
  totals: { assets: number; originalBytes: number };
  partCount: number;
  parts: Array<{ index: number; count: number; bytes: number; served: boolean; file: string }>;
  failures: ExportFailure[];
  complete: boolean;
  incompleteReasons: string[];
  egress: { usedBytes: number; allowanceBytes: number; windowAllowanceBytes: number };
  downloads: { status: string; manifest: string; parts: string[] };
}

/** How long finished (superseded/canceled/expired) rows linger for debugging. */
const EXPORT_ROW_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Active plus bounded inactive history; force-create cannot grow rows forever. */
const EXPORT_MAX_RETAINED_ROWS_PER_USER = 32;
/** Planning/manifest admission is bounded but may scan a large library. */
const EXPORT_PLANNING_TRANSACTION_TIMEOUT_MS = 120_000;
const EXPORT_LIFECYCLE_POLL_MS = 1_000;

type ExportDatabase = NonNullable<typeof prisma> | Prisma.TransactionClient;

function requirePrismaDb(): NonNullable<typeof prisma> {
  if (!prisma) throw new Error('library export requires a configured database');
  return prisma;
}

function requireDb(database?: ExportDatabase): ExportDatabase {
  if (database) return database;
  return requirePrismaDb();
}

// Prisma returns Json columns as unknown; normalize defensively so a
// hand-edited or partially-migrated row can never crash the export path.
export function normalizeExportRow(row: Record<string, unknown>): ExportRowData {
  const partBoundaries = Array.isArray(row.partBoundaries)
    ? (row.partBoundaries as ExportPartBoundary[])
    : [];
  if (!validateExportPartBoundaries(row.partBoundaries)) {
    throw new Error('library export has invalid or oversized part boundaries');
  }
  const servedParts = Array.isArray(row.servedParts)
    ? (row.servedParts as unknown[]).filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    : [];
  if (servedParts.length > row.partBoundaries.length) {
    throw new Error('library export has oversized served-parts metadata');
  }
  const failures =
    row.failures && typeof row.failures === 'object' && !Array.isArray(row.failures)
      ? (row.failures as ExportFailuresByPart)
      : {};

  return {
    id: String(row.id),
    ownerUserId: String(row.ownerUserId),
    status: row.status as LibraryExportStatus,
    snapshotAt: row.snapshotAt as Date,
    expiresAt: row.expiresAt as Date,
    manifestVersion: String(row.manifestVersion),
    totalAssets: Number(row.totalAssets),
    totalOriginalBytes: BigInt(row.totalOriginalBytes as bigint | number),
    partBoundaries,
    servedParts,
    failures,
    egressBytes: BigInt(row.egressBytes as bigint | number),
    manifestMetadataBytes: BigInt((row.manifestMetadataBytes as bigint | number | undefined) ?? 0),
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export function toExportView(row: ExportRowData, now: Date = new Date()): LibraryExportView {
  const served = new Set(row.servedParts);
  const { complete, reasons } = computeCompleteness(
    row.partBoundaries.length,
    row.servedParts,
    row.failures,
  );
  const status =
    row.status === 'active' && isExportExpired(row.expiresAt, now) ? 'expired' : row.status;
  const base = `/api/library/export/${row.id}`;

  return {
    id: row.id,
    status,
    createdAt: row.createdAt.toISOString(),
    snapshotAt: row.snapshotAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    manifestVersion: row.manifestVersion,
    totals: {
      assets: row.totalAssets,
      originalBytes: Number(row.totalOriginalBytes),
    },
    partCount: row.partBoundaries.length,
    parts: row.partBoundaries.map((part) => ({
      index: part.index,
      count: part.count,
      bytes: part.bytes,
      served: served.has(part.index),
      file: partFileName(row.id, part.index, row.partBoundaries.length),
    })),
    failures: flattenFailures(row.failures),
    complete,
    incompleteReasons: reasons,
    egress: {
      usedBytes: Number(row.egressBytes),
      allowanceBytes: Number(exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes)),
      windowAllowanceBytes: Number(exportEgressWindowAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes)),
    },
    downloads: {
      status: base,
      manifest: `${base}/manifest`,
      parts: row.partBoundaries.map((part) => `${base}/parts/${part.index}`),
    },
  };
}

async function planSnapshot(
  db: ExportDatabase,
  userId: string,
  snapshotAt: Date,
): Promise<{ boundaries: ExportPartBoundary[]; totalAssets: number; totalOriginalBytes: bigint }> {
  const where = snapshotAssetWhere(userId, snapshotAt);
  const planner = createExportPartPlanner();
  const boundaries = planner.parts;
  let totalAssets = 0;
  let totalOriginalBytes = BigInt(0);
  let cursor: string | null = null;

  for (;;) {
    const page: Array<{ id: string; size: number }> = await db.asset.findMany({
      where: cursor === null ? where : { ...where, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: EXPORT_SCAN_PAGE_SIZE,
      select: { id: true, size: true },
    });
    for (const entry of page) {
      planner.add(entry);
      totalAssets += 1;
      totalOriginalBytes += BigInt(entry.size);
    }
    if (page.length < EXPORT_SCAN_PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }

  return { boundaries, totalAssets, totalOriginalBytes };
}


export interface ExportLifecycleMonitor {
  signal: AbortSignal;
  stop: () => void;
}

/** Polls terminal state without holding a DB transaction across streaming. */
export function monitorExportLifecycle(
  ownerUserId: string,
  exportId: string,
  intervalMs: number = EXPORT_LIFECYCLE_POLL_MS,
): ExportLifecycleMonitor {
  const db = requirePrismaDb();
  const controller = new AbortController();
  let stopped = false;
  const check = async () => {
    if (stopped || controller.signal.aborted) return;
    try {
      const current = await db.libraryExport.findFirst({
        where: { id: exportId, ownerUserId },
        select: { status: true, expiresAt: true },
      });
      if (!current || current.status !== 'active' || isExportExpired(current.expiresAt as Date)) {
        controller.abort();
      }
    } catch {
      // Fail closed if lifecycle cannot be verified during an active stream.
      controller.abort();
    }
  };
  void check();
  const timer = setInterval(() => void check(), Math.max(10, intervalMs));
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
  return { signal: controller.signal, stop };
}

export async function createOrReuseExport(
  userId: string,
  options: { force?: boolean } = {},
): Promise<{ export: LibraryExportView; reused: boolean }> {
  const db = requirePrismaDb();
  const now = new Date();

  const active = await db.libraryExport.findFirst({
    where: { ownerUserId: userId, status: 'active' },
  });
  if (active && !options.force && !isExportExpired(active.expiresAt as Date, now)) {
    return { export: toExportView(normalizeExportRow(active)), reused: true };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const lockedActive = await tx.libraryExport.findFirst({
        where: { ownerUserId: userId, status: 'active' },
      });
      if (lockedActive && !options.force && !isExportExpired(lockedActive.expiresAt as Date, now)) {
        return { row: lockedActive, reused: true };
      }

      // Keep planning and active-row creation under the same identity lock as
      // permanent asset deletion. Never hold this transaction across streaming.
      const snapshotAt = new Date();
      const { boundaries, totalAssets, totalOriginalBytes } = await planSnapshot(
        tx,
        userId,
        snapshotAt,
      );
      await tx.libraryExport.deleteMany({
        where: {
          ownerUserId: userId,
          expiresAt: { lt: new Date(now.getTime() - EXPORT_ROW_RETENTION_MS) },
        },
      });
      await tx.libraryExport.updateMany({
        where: { ownerUserId: userId, status: 'active' },
        data: { status: 'superseded' },
      });
      const inactiveToDelete = await tx.libraryExport.findMany({
        where: { ownerUserId: userId, status: { not: 'active' } },
        orderBy: { updatedAt: 'desc' },
        skip: EXPORT_MAX_RETAINED_ROWS_PER_USER - 1,
        select: { id: true },
      });
      if (inactiveToDelete.length > 0) {
        await tx.libraryExport.deleteMany({
          where: { id: { in: inactiveToDelete.map((row) => row.id) } },
        });
      }
      const row = await tx.libraryExport.create({
        data: {
          ownerUserId: userId,
          status: 'active',
          snapshotAt,
          expiresAt: new Date(snapshotAt.getTime() + EXPORT_TTL_MS),
          manifestVersion: EXPORT_MANIFEST_VERSION,
          totalAssets,
          totalOriginalBytes,
          manifestMetadataBytes: BigInt(0),
          partBoundaries: boundaries as unknown as Prisma.InputJsonValue,
          servedParts: [] as unknown as Prisma.InputJsonValue,
          failures: {} as unknown as Prisma.InputJsonValue,
        },
      });
      const manifestMetadataBytes = await estimateManifestEgressBytesForExport(
        normalizeExportRow(row),
        tx,
      );
      await tx.libraryExport.updateMany({
        where: { id: row.id },
        data: { manifestMetadataBytes },
      });
      const finalized = await tx.libraryExport.findFirst({ where: { id: row.id } });
      return { row: finalized ?? row, reused: false };
    }, { maxWait: EXPORT_PLANNING_TRANSACTION_TIMEOUT_MS, timeout: EXPORT_PLANNING_TRANSACTION_TIMEOUT_MS });
    return {
      export: toExportView(normalizeExportRow(result.row)),
      reused: result.reused,
    };
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      const winner = await db.libraryExport.findFirst({
        where: { ownerUserId: userId, status: 'active' },
      });
      if (winner) return { export: toExportView(normalizeExportRow(winner)), reused: true };
    }
    throw error;
  }
}

export async function getActiveExport(userId: string): Promise<LibraryExportView | null> {
  const db = requireDb();
  const row = await db.libraryExport.findFirst({
    where: { ownerUserId: userId, status: 'active' },
  });
  return row ? toExportView(normalizeExportRow(row)) : null;
}

export async function getOwnedExport(
  userId: string,
  exportId: string,
  database?: ExportDatabase,
): Promise<ExportRowData | null> {
  const db = requireDb(database);
  const row = await db.libraryExport.findFirst({
    where: { id: exportId, ownerUserId: userId },
  });
  return row ? normalizeExportRow(row) : null;
}

export async function cancelExport(userId: string, exportId: string): Promise<boolean> {
  const db = requireDb();
  const result = await db.libraryExport.updateMany({
    where: { id: exportId, ownerUserId: userId, status: 'active' },
    data: { status: 'canceled' },
  });
  return result.count > 0;
}

export type ExportAccess =
  | { kind: 'not_found' }
  | { kind: 'gone'; code: 'export_expired' | 'export_unavailable' }
  | { kind: 'ok'; row: ExportRowData };

/** Shared download-capability check: owned, active, and unexpired. */
export async function accessExportForDownload(
  userId: string,
  exportId: string,
): Promise<ExportAccess> {
  const row = await getOwnedExport(userId, exportId);
  if (!row) return { kind: 'not_found' };
  if (row.status !== 'active') return { kind: 'gone', code: 'export_unavailable' };
  if (isExportExpired(row.expiresAt)) return { kind: 'gone', code: 'export_expired' };
  return { kind: 'ok', row };
}

export type ExportEgressAdmission =
  | { kind: 'reserved'; reservedBytes: bigint }
  | { kind: 'refused'; code: 'export_egress_exhausted' | 'export_egress_window_exhausted' }
  | { kind: 'gone' };

/**
 * Durable, atomic pre-stream egress admission.
 *
 * Charges `reserveBytes` against the export's budget in ONE conditional
 * UPDATE — Postgres serializes concurrent updates on the row and re-checks
 * the predicate after each lock wait, so concurrent part/manifest admissions
 * can never collectively exceed the allowance. The reservation is the
 * charge: an aborted delivery simply keeps it (settle happens only on clean
 * completion via {@link refundExportEgress}), which makes the bound hold
 * across client aborts, retries, and process death.
 *
 * Two ceilings apply, and the row may only grow to the lower one:
 * - per-export: `exportEgressAllowance(totalOriginalBytes)`
 * - tenant window: `exportEgressWindowAllowance(...)` minus what the user's
 *   OTHER export sessions egressed inside the rolling window. Those rows are
 *   immutable-upward once no longer active (only the single active session
 *   can reserve; settlements only decrease), so reading their sum before the
 *   conditional UPDATE is race-free in the conservative direction.
 */
export async function reserveExportEgress(
  row: ExportRowData,
  reserveBytes: bigint,
  now: Date = new Date(),
  database?: ExportDatabase,
): Promise<ExportEgressAdmission> {
  const db = requireDb(database);
  const perExportAllowance = exportEgressAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
  const windowAllowance = exportEgressWindowAllowance(row.totalOriginalBytes, row.totalAssets, row.manifestMetadataBytes);
  const windowStart = new Date(now.getTime() - EXPORT_EGRESS_WINDOW_MS);

  const others = await db.libraryExport.aggregate({
    _sum: { egressBytes: true },
    where: {
      ownerUserId: row.ownerUserId,
      id: { not: row.id },
      updatedAt: { gte: windowStart },
    },
  });
  const windowSpentElsewhere = others._sum.egressBytes ?? BigInt(0);
  const windowHeadroom = windowAllowance - windowSpentElsewhere;
  const ceiling = perExportAllowance < windowHeadroom ? perExportAllowance : windowHeadroom;

  const admitted = await db.libraryExport.updateMany({
    where: {
      id: row.id,
      status: 'active',
      expiresAt: { gt: now },
      egressBytes: { lte: ceiling - reserveBytes },
    },
    data: { egressBytes: { increment: reserveBytes } },
  });
  if (admitted.count === 1) {
    return { kind: 'reserved', reservedBytes: reserveBytes };
  }

  // Refused — classify against fresh state (informational only; the refusal
  // itself was decided atomically above).
  const fresh = await getOwnedExport(row.ownerUserId, row.id, db);
  if (!fresh || fresh.status !== 'active' || isExportExpired(fresh.expiresAt, now)) {
    return { kind: 'gone' };
  }
  if (fresh.egressBytes + reserveBytes > perExportAllowance) {
    return { kind: 'refused', code: 'export_egress_exhausted' };
  }
  return { kind: 'refused', code: 'export_egress_window_exhausted' };
}

/**
 * Settle a reservation down to the bytes actually streamed, on clean
 * completion only. Each stream refunds at most once and at most its own
 * reservation, so the counter can never go negative or hand out free bytes;
 * a lost refund (crash, abort) just leaves the conservative full charge.
 */
export async function refundExportEgress(exportId: string, refundBytes: bigint): Promise<void> {
  if (refundBytes <= BigInt(0)) return;
  const db = requireDb();
  await db.libraryExport.updateMany({
    where: { id: exportId, status: 'active', expiresAt: { gt: new Date() }, egressBytes: { gte: refundBytes } },
    data: { egressBytes: { decrement: refundBytes } },
  });
}

/** Resolve the concrete asset entries for one part of the frozen snapshot. */
export async function entriesForPart(
  row: ExportRowData,
  partIndex: number,
  database?: ExportDatabase,
): Promise<ExportZipEntry[]> {
  const db = requireDb(database);
  const boundary = row.partBoundaries[partIndex];
  if (!boundary) {
    throw new Error(`export ${row.id} has no part ${partIndex}`);
  }
  const where = snapshotAssetWhere(row.ownerUserId, row.snapshotAt);
  const assets: Array<{
    id: string;
    blobUrl: string;
    mime: string;
    size: number;
    checksumSha256: string;
  }> = await db.asset.findMany({
    where: boundary.afterId === null ? where : { ...where, id: { gt: boundary.afterId } },
    orderBy: { id: 'asc' },
    take: boundary.count,
    select: { id: true, blobUrl: true, mime: true, size: true, checksumSha256: true },
  });

  return assets.map((asset) => ({
    assetId: asset.id,
    archivePath: archivePathFor(asset.id, asset.mime),
    url: asset.blobUrl,
    sha256: asset.checksumSha256,
    size: asset.size,
  }));
}

/**
 * Atomically record the outcome of a fully-streamed part: mark it served
 * (idempotently) and replace that part's failure list wholesale (so a clean
 * retry clears earlier failures). Egress is never touched here — it was
 * charged at admission ({@link reserveExportEgress}) and is settled
 * separately ({@link refundExportEgress}).
 */
export async function recordPartOutcome(
  exportId: string,
  partIndex: number,
  failures: ExportFailure[],
): Promise<void> {
  const db = requireDb();
  const indexJson = JSON.stringify(partIndex);
  const failuresJson = JSON.stringify(failures);
  const partKey = String(partIndex);

  await db.$executeRaw`
    UPDATE "library_exports"
    SET
      "served_parts" = CASE
        WHEN "served_parts" @> ${indexJson}::jsonb THEN "served_parts"
        ELSE "served_parts" || ${indexJson}::jsonb
      END,
      "failures" = jsonb_set("failures", ARRAY[${partKey}], ${failuresJson}::jsonb, true),
      "updated_at" = NOW()
    WHERE "id" = ${exportId}
      AND "status" = 'active'
      AND "expires_at" > NOW()
  `;
}
