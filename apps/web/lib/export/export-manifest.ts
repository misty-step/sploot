import type { Prisma } from '@prisma/client';
import { isValidTagColor, isValidTagName } from '@sploot/common';
import { prisma } from '@/lib/db';
import { acquireEnrollmentIdentityWriterLock } from '@/lib/enrollment/enrollment-policy';
import {
  EXPORT_SCAN_PAGE_SIZE,
  archivePathFor,
  computeCompleteness,
  flattenFailures,
  partFileName,
  snapshotAssetWhere,
} from './export-policy';
import { normalizeExportRow, type ExportRowData } from './export-service';
import { EXPORT_BACKPRESSURE_TIMEOUT_MS, waitForExportCapacity } from './export-backpressure';

/**
 * Streamed generation of the versioned export manifest (schema documented
 * in `apps/web/docs/EXPORT.md`).
 *
 * The manifest is the export's integrity record: it lists every asset in
 * the frozen snapshot with portable metadata and explicitly states whether
 * the export is complete — including which parts were never fully
 * downloaded and which objects failed or went missing. It is generated from
 * paged database reads and streamed, so a large library never sits in
 * memory as one JSON blob.
 */

export interface StreamExportManifestOptions {
  row: ExportRowData;
  /** Hard byte cap (the admitted egress reservation); exceeding it errors the stream. */
  maxBytes?: bigint;
  backpressureTimeoutMs?: number;
  signal?: AbortSignal;
  onComplete?: (bytesStreamed: number) => void | Promise<void>;
  onFinish?: () => void;
}

interface ManifestAssetRow {
  id: string;
  mime: string;
  size: number;
  checksumSha256: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  phash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ManifestTagRow {
  name: string;
  color: string | null;
}

interface ManifestAssetTagRow {
  assetId: string;
  tag: { name: string };
}

type ManifestDatabase = NonNullable<typeof prisma> | Prisma.TransactionClient;

function requireDb(database?: ManifestDatabase): ManifestDatabase {
  if (database) return database;
  if (!prisma) {
    throw new Error('library export requires a configured database');
  }
  return prisma;
}

async function withManifestRead<T>(
  database: ManifestDatabase,
  row: ExportRowData,
  read: (database: ManifestDatabase, current: ExportRowData) => Promise<T>,
): Promise<T> {
  if (!('$transaction' in database) || typeof database.$transaction !== 'function') {
    return read(database, row);
  }
  return database.$transaction(async (tx) => {
    await acquireEnrollmentIdentityWriterLock(tx, row.ownerUserId);
    const current = await tx.libraryExport.findFirst({
      where: { id: row.id, ownerUserId: row.ownerUserId },
    });
    if (!current || current.status !== 'active') {
      throw new Error('export became unavailable during manifest read');
    }
    return read(tx, normalizeExportRow(current as unknown as Record<string, unknown>));
  });
}

async function withManifestFinalization<T>(
  database: ManifestDatabase,
  row: ExportRowData,
  read: (database: ManifestDatabase, current: ExportRowData) => Promise<T>,
): Promise<T> {
  if (!('$transaction' in database) || typeof database.$transaction !== 'function') {
    return read(database, row);
  }
  return database.$transaction(async (tx) => {
    await acquireEnrollmentIdentityWriterLock(tx, row.ownerUserId);
    const current = await tx.libraryExport.findFirst({
      where: { id: row.id, ownerUserId: row.ownerUserId },
    });
    if (!current || current.status !== 'active') {
      throw new Error('export became unavailable during manifest finalization');
    }
    const claimed = await tx.libraryExport.updateMany({
      where: { id: row.id, ownerUserId: row.ownerUserId, status: 'active' },
      data: { status: 'finalizing' },
    });
    if (claimed.count !== 1) {
      throw new Error('export became unavailable during manifest finalization');
    }
    const finalRow = await tx.libraryExport.findFirst({
      where: { id: row.id, ownerUserId: row.ownerUserId },
    });
    if (!finalRow || finalRow.status !== 'finalizing') {
      throw new Error('export finalization fence was lost');
    }
    return read(tx, normalizeExportRow(finalRow as unknown as Record<string, unknown>));
  });
}

async function releaseManifestFinalization(database: ManifestDatabase, row: ExportRowData): Promise<void> {
  await database.libraryExport.updateMany({
    where: { id: row.id, ownerUserId: row.ownerUserId, status: 'finalizing' },
    data: { status: 'active' },
  });
}

async function findManifestTags(
  database: ManifestDatabase,
  row: ExportRowData,
  where: Prisma.TagWhereInput,
): Promise<ManifestTagRow[]> {
  const tags = await withManifestRead(database, row, (db) =>
    db.tag.findMany({ where, orderBy: { name: 'asc' }, take: EXPORT_SCAN_PAGE_SIZE, select: { name: true, color: true } }),
  );
  if (tags.some((tag) => !isValidTagName(tag.name) || !isValidTagColor(tag.color))) {
    throw new Error('export contains invalid tag metadata');
  }
  return tags;
}

async function findManifestAssets(
  database: ManifestDatabase,
  row: ExportRowData,
  where: Prisma.AssetWhereInput,
): Promise<ManifestAssetRow[]> {
  return withManifestRead(database, row, (db) =>
    db.asset.findMany({
      where,
      orderBy: { id: 'asc' },
      take: EXPORT_SCAN_PAGE_SIZE,
      select: {
        id: true, mime: true, size: true, checksumSha256: true, width: true, height: true,
        favorite: true, phash: true, createdAt: true, updatedAt: true,
      },
    }),
  );
}

async function findManifestAssetTags(
  database: ManifestDatabase,
  row: ExportRowData,
  assetIds: string[],
): Promise<ManifestAssetTagRow[]> {
  const rows = await withManifestRead(database, row, (db) =>
    db.assetTag.findMany({
      where: { assetId: { in: assetIds } },
      select: { assetId: true, tag: { select: { name: true } } },
    }),
  );
  if (rows.some((row) => !isValidTagName(row.tag.name))) {
    throw new Error('export contains invalid asset tag metadata');
  }
  return rows;
}

function manifestStaticHead(row: ExportRowData) {
  return {
    manifest: 'sploot-library-export',
    manifestVersion: row.manifestVersion,
    exportId: row.id,
    generatedAt: new Date().toISOString(),
    snapshotAt: row.snapshotAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    parts: row.partBoundaries.map((part) => ({
      index: part.index,
      file: partFileName(row.id, part.index, row.partBoundaries.length),
      assets: part.count,
      bytes: part.bytes,
    })),
  };
}

function manifestSummary(
  row: ExportRowData,
  liveAssets: number,
  complete: boolean,
  reasons: string[],
  failures: ReturnType<typeof flattenFailures>,
) {
  return {
    complete,
    incompleteReasons: reasons,
    totals: {
      assets: liveAssets,
      snapshotAssets: row.totalAssets,
      originalBytes: Number(row.totalOriginalBytes),
      parts: row.partBoundaries.length,
      servedParts: row.servedParts.length,
      failedObjects: failures.length,
    },
    failures,
    parts: row.partBoundaries.map((part) => ({
      index: part.index,
      file: partFileName(row.id, part.index, row.partBoundaries.length),
      assets: part.count,
      bytes: part.bytes,
      served: new Set(row.servedParts).has(part.index),
    })),
  };
}

function manifestAssetEntry(
  row: ExportRowData,
  asset: ManifestAssetRow,
  tagsByAsset: Map<string, string[]>,
  partIndex: number,
) {
  return {
    id: asset.id,
    archivePath: archivePathFor(asset.id, asset.mime),
    part: row.partBoundaries.length === 0 ? null : partIndex,
    mime: asset.mime,
    bytes: asset.size,
    sha256: asset.checksumSha256,
    width: asset.width,
    height: asset.height,
    favorite: asset.favorite,
    phash: asset.phash,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    tags: (tagsByAsset.get(asset.id) ?? []).sort(),
  };
}

/** Covers small metadata changes between the admission scan and stream scan. */
const MANIFEST_RESERVATION_SLACK_BYTES = 4 * 1024;

const manifestEncoder = new TextEncoder();
function utf8Bytes(value: string): bigint {
  return BigInt(manifestEncoder.encode(value).byteLength);
}

/**
 * Compute the reservation from actual manifest rows without retaining the
 * manifest in memory. Tag names are user-controlled and have no length cap,
 * so a fixed per-asset estimate cannot safely bound this response.
 */
export async function estimateManifestEgressBytesForExport(
  row: ExportRowData,
  database?: ManifestDatabase,
): Promise<bigint> {
  const db = requireDb(database);
  const { complete, reasons } = computeCompleteness(
    row.partBoundaries.length,
    row.servedParts,
    row.failures,
  );
  const failures = flattenFailures(row.failures);
  const headJson = JSON.stringify(manifestStaticHead(row));
  let bytes = utf8Bytes(headJson.slice(0, -1) + ',"tags":[');
  let emittedTag = false;
  let tagCursor: string | null = null;

  for (;;) {
    const page: ManifestTagRow[] = await findManifestTags(db, row, {
      ownerUserId: row.ownerUserId,
      assets: { some: { asset: snapshotAssetWhere(row.ownerUserId, row.snapshotAt) } },
      ...(tagCursor === null ? {} : { name: { gt: tagCursor } }),
    });
    if (page.length === 0) break;
    for (const tag of page) {
      bytes += utf8Bytes((emittedTag ? ',' : '') + JSON.stringify(tag));
      emittedTag = true;
    }
    const nextCursor = page[page.length - 1].name;
    if (page.length < EXPORT_SCAN_PAGE_SIZE || nextCursor === tagCursor) break;
    tagCursor = nextCursor;
  }

  bytes += utf8Bytes('],"assets":[');
  const where = snapshotAssetWhere(row.ownerUserId, row.snapshotAt);
  const cumulativeCounts: number[] = [];
  let running = 0;
  for (const part of row.partBoundaries) {
    running += part.count;
    cumulativeCounts.push(running);
  }

  let cursor: string | null = null;
  let streamedAssets = 0;
  let partIndex = 0;
  for (;;) {
    const page: ManifestAssetRow[] = await findManifestAssets(
        db,
        row,
        cursor === null ? where : { ...where, id: { gt: cursor } },
      );
    if (page.length === 0) break;

    const tagRows: ManifestAssetTagRow[] = await findManifestAssetTags(
      db,
      row,
      page.map((asset) => asset.id),
    );
    const tagsByAsset = new Map<string, string[]>();
    for (const tagRow of tagRows) {
      const list = tagsByAsset.get(tagRow.assetId) ?? [];
      list.push(tagRow.tag.name);
      tagsByAsset.set(tagRow.assetId, list);
    }

    for (const asset of page) {
      while (
        partIndex < cumulativeCounts.length - 1 &&
        streamedAssets >= cumulativeCounts[partIndex]
      ) {
        partIndex += 1;
      }
      const entry = manifestAssetEntry(row, asset, tagsByAsset, partIndex);
      bytes += utf8Bytes((streamedAssets > 0 ? ',' : '') + JSON.stringify(entry));
      streamedAssets += 1;
    }

    if (page.length < EXPORT_SCAN_PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }

  const estimateReasons = streamedAssets < row.totalAssets
    ? [...reasons, 'snapshot_membership_changed' as const]
    : reasons;
  const summary = manifestSummary(
    row,
    streamedAssets,
    complete && streamedAssets >= row.totalAssets,
    estimateReasons,
    failures,
  );
  return bytes + utf8Bytes('],' + JSON.stringify(summary).slice(1)) + BigInt(MANIFEST_RESERVATION_SLACK_BYTES);
}

export function streamExportManifest(
  options: StreamExportManifestOptions,
): ReadableStream<Uint8Array> {
  const { row, maxBytes, backpressureTimeoutMs = EXPORT_BACKPRESSURE_TIMEOUT_MS, signal, onComplete, onFinish } = options;
  const encoder = new TextEncoder();
  let canceled = false;
  let clientCanceled = false;
  let terminalError: Error | null = null;
  let finalizationHeld = false;
  const abort = () => {
    canceled = true;
    if (!clientCanceled && !terminalError) terminalError = new Error('export became unavailable during stream');
  };
  const ensureOpen = (): boolean => {
    if (!canceled) return true;
    if (terminalError) throw terminalError;
    return false;
  };

  async function run(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const db = requireDb();
    let bytesStreamed = 0;

    const emit = async (text: string): Promise<void> => {
      await waitForExportCapacity(() => controller.desiredSize, () => canceled, backpressureTimeoutMs);
      if (!ensureOpen()) return;
      const chunk = encoder.encode(text);
      if (maxBytes !== undefined && BigInt(bytesStreamed + chunk.length) > maxBytes) {
        // Never hand out a byte past the admitted reservation.
        throw new Error('export manifest would exceed its egress reservation');
      }
      bytesStreamed += chunk.length;
      controller.enqueue(chunk);
    };

    try {
      // Probe lifecycle before emitting any bytes; only assets actually
      // emitted below become manifest totals.
      await withManifestRead(db, row, async () => undefined);
      const headJson = JSON.stringify(manifestStaticHead(row));
      // Completeness and live totals are emitted only after the asset pages.
      // The streamed membership is the authoritative count; no pre-scan COUNT
      // can race a hard delete between the header and the first page.
      await emit(headJson.slice(0, -1) + ',"tags":[');

      let emittedTag = false;
      let tagCursor: string | null = null;
      for (;;) {
        if (!ensureOpen()) return;
        const page: ManifestTagRow[] = await findManifestTags(db, row, {
      ownerUserId: row.ownerUserId,
      assets: { some: { asset: snapshotAssetWhere(row.ownerUserId, row.snapshotAt) } },
      ...(tagCursor === null ? {} : { name: { gt: tagCursor } }),
    });
        if (page.length === 0) break;
        for (const tag of page) {
          await emit((emittedTag ? ',' : '') + JSON.stringify(tag));
          emittedTag = true;
        }
        const nextCursor = page[page.length - 1].name;
        if (page.length < EXPORT_SCAN_PAGE_SIZE || nextCursor === tagCursor) break;
        tagCursor = nextCursor;
      }

      await emit('],"assets":[');

      const where = snapshotAssetWhere(row.ownerUserId, row.snapshotAt);
      // Part membership follows the same ascending-id order the planner used.
      const cumulativeCounts: number[] = [];
      let running = 0;
      for (const part of row.partBoundaries) {
        running += part.count;
        cumulativeCounts.push(running);
      }

      let cursor: string | null = null;
      let streamedAssets = 0;
      let partIndex = 0;

      for (;;) {
        if (!ensureOpen()) return;
        const page: ManifestAssetRow[] = await findManifestAssets(
        db,
        row,
        cursor === null ? where : { ...where, id: { gt: cursor } },
      );
        if (page.length === 0) break;

        const tagRows = await findManifestAssetTags(
          db,
          row,
          page.map((asset) => asset.id),
        );
        const tagsByAsset = new Map<string, string[]>();
        for (const tagRow of tagRows) {
          const list = tagsByAsset.get(tagRow.assetId) ?? [];
          list.push(tagRow.tag.name);
          tagsByAsset.set(tagRow.assetId, list);
        }

        for (const asset of page) {
          while (
            partIndex < cumulativeCounts.length - 1 &&
            streamedAssets >= cumulativeCounts[partIndex]
          ) {
            partIndex += 1;
          }
          const entry = manifestAssetEntry(row, asset, tagsByAsset, partIndex);
          await emit(`${streamedAssets > 0 ? ',' : ''}${JSON.stringify(entry)}`);
          streamedAssets += 1;
        }

        if (page.length < EXPORT_SCAN_PAGE_SIZE) break;
        cursor = page[page.length - 1].id;
      }

      if (!ensureOpen()) return;
      // A delete can win after the final asset page. Reconcile status before
      // the authoritative trailing summary so that stream errors, rather than
      // claiming a complete manifest for a canceled snapshot.
      // Wait outside the database transaction. Once capacity exists, the
      // identity-locked read and terminal enqueue are synchronous, so cancel
      // cannot commit between the final status fence and summary bytes.
      await waitForExportCapacity(
        () => controller.desiredSize,
        () => canceled,
        backpressureTimeoutMs,
        () => abort(),
      );
      await withManifestFinalization(db, row, async (_db, finalRow) => {
        finalizationHeld = true;
        if (!ensureOpen()) return;
        const finalFailures = flattenFailures(finalRow.failures);
        const finalCompleteness = computeCompleteness(
          finalRow.partBoundaries.length,
          finalRow.servedParts,
          finalRow.failures,
        );
        const manifestLiveAssets = streamedAssets;
        const manifestReasons = manifestLiveAssets < finalRow.totalAssets
          ? [...finalCompleteness.reasons, 'snapshot_membership_changed' as const]
          : finalCompleteness.reasons;
        const summary = manifestSummary(
          finalRow,
          manifestLiveAssets,
          finalCompleteness.complete && manifestLiveAssets >= finalRow.totalAssets,
          manifestReasons,
          finalFailures,
        );
        const chunk = encoder.encode('],' + JSON.stringify(summary).slice(1));
        if (maxBytes !== undefined && BigInt(bytesStreamed + chunk.length) > maxBytes) {
          throw new Error('export manifest would exceed its egress reservation');
        }
        bytesStreamed += chunk.length;
        controller.enqueue(chunk);
      });

      if (!ensureOpen()) return;
      if (onComplete) {
        await onComplete(bytesStreamed);
      }
      if (finalizationHeld) {
        await releaseManifestFinalization(db, row);
        finalizationHeld = false;
      }
      controller.close();
    } catch (error) {
      if (!clientCanceled) {
        controller.error(error);
      }
    } finally {
      if (finalizationHeld) {
        await releaseManifestFinalization(db, row).catch(() => undefined);
      }
      onFinish?.();
      signal?.removeEventListener('abort', abort);
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      void run(controller);
    },
    cancel() {
      clientCanceled = true;
      abort();
    },
  });
}
