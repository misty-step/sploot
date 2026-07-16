import { prisma } from '@/lib/db';
import {
  EXPORT_SCAN_PAGE_SIZE,
  archivePathFor,
  computeCompleteness,
  flattenFailures,
  partFileName,
  snapshotAssetWhere,
} from './export-policy';
import type { ExportRowData } from './export-service';

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
  onComplete?: (bytesStreamed: number) => void | Promise<void>;
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

function requireDb(): NonNullable<typeof prisma> {
  if (!prisma) {
    throw new Error('library export requires a configured database');
  }
  return prisma;
}

function manifestHead(
  row: ExportRowData,
  complete: boolean,
  reasons: string[],
  failures: ReturnType<typeof flattenFailures>,
) {
  const served = new Set(row.servedParts);
  return {
    manifest: 'sploot-library-export',
    manifestVersion: row.manifestVersion,
    exportId: row.id,
    generatedAt: new Date().toISOString(),
    snapshotAt: row.snapshotAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    complete,
    incompleteReasons: reasons,
    totals: {
      assets: row.totalAssets,
      originalBytes: Number(row.totalOriginalBytes),
      parts: row.partBoundaries.length,
      servedParts: row.servedParts.length,
      failedObjects: failures.length,
    },
    parts: row.partBoundaries.map((part) => ({
      index: part.index,
      file: partFileName(row.id, part.index, row.partBoundaries.length),
      assets: part.count,
      bytes: part.bytes,
      served: served.has(part.index),
    })),
    failures,
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
export async function estimateManifestEgressBytesForExport(row: ExportRowData): Promise<bigint> {
  const db = requireDb();
  const { complete, reasons } = computeCompleteness(
    row.partBoundaries.length,
    row.servedParts,
    row.failures,
  );
  const failures = flattenFailures(row.failures);
  const head = manifestHead(row, complete, reasons, failures);
  const headJson = JSON.stringify(head);
  let bytes = utf8Bytes(headJson.slice(0, -1) + ',"tags":[');
  let emittedTag = false;
  let tagCursor: string | null = null;

  for (;;) {
    const page: ManifestTagRow[] = await db.tag.findMany({
      where:
        tagCursor === null
          ? { ownerUserId: row.ownerUserId }
          : { ownerUserId: row.ownerUserId, name: { gt: tagCursor } },
      orderBy: { name: 'asc' },
      take: EXPORT_SCAN_PAGE_SIZE,
      select: { name: true, color: true },
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
    const page: ManifestAssetRow[] = await db.asset.findMany({
      where: cursor === null ? where : { ...where, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: EXPORT_SCAN_PAGE_SIZE,
      select: {
        id: true,
        mime: true,
        size: true,
        checksumSha256: true,
        width: true,
        height: true,
        favorite: true,
        phash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (page.length === 0) break;

    const tagRows: ManifestAssetTagRow[] = await db.assetTag.findMany({
      where: { assetId: { in: page.map((asset) => asset.id) } },
      select: { assetId: true, tag: { select: { name: true } } },
    });
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

  return bytes + utf8Bytes(']}') + BigInt(MANIFEST_RESERVATION_SLACK_BYTES);
}

export function streamExportManifest(
  options: StreamExportManifestOptions,
): ReadableStream<Uint8Array> {
  const { row, maxBytes, onComplete } = options;
  const encoder = new TextEncoder();
  let canceled = false;

  async function run(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const db = requireDb();
    let bytesStreamed = 0;

    const emit = (text: string) => {
      if (canceled) return;
      const chunk = encoder.encode(text);
      if (maxBytes !== undefined && BigInt(bytesStreamed + chunk.length) > maxBytes) {
        // Never hand out a byte past the admitted reservation.
        throw new Error('export manifest would exceed its egress reservation');
      }
      bytesStreamed += chunk.length;
      controller.enqueue(chunk);
    };

    try {
      const { complete, reasons } = computeCompleteness(
        row.partBoundaries.length,
        row.servedParts,
        row.failures,
      );
      const failures = flattenFailures(row.failures);
      const head = manifestHead(row, complete, reasons, failures);
      const headJson = JSON.stringify(head);
      // Open the tags array by splicing into the serialized head object.
      emit(headJson.slice(0, -1) + ',"tags":[');

      let emittedTag = false;
      let tagCursor: string | null = null;
      for (;;) {
        if (canceled) return;
        const page: ManifestTagRow[] = await db.tag.findMany({
          where:
            tagCursor === null
              ? { ownerUserId: row.ownerUserId }
              : { ownerUserId: row.ownerUserId, name: { gt: tagCursor } },
          orderBy: { name: 'asc' },
          take: EXPORT_SCAN_PAGE_SIZE,
          select: { name: true, color: true },
        });
        if (page.length === 0) break;
        for (const tag of page) {
          emit((emittedTag ? ',' : '') + JSON.stringify(tag));
          emittedTag = true;
        }
        const nextCursor = page[page.length - 1].name;
        if (page.length < EXPORT_SCAN_PAGE_SIZE || nextCursor === tagCursor) break;
        tagCursor = nextCursor;
      }

      emit('],"assets":[');

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
        if (canceled) return;
        const page: ManifestAssetRow[] = await db.asset.findMany({
          where: cursor === null ? where : { ...where, id: { gt: cursor } },
          orderBy: { id: 'asc' },
          take: EXPORT_SCAN_PAGE_SIZE,
          select: {
            id: true,
            mime: true,
            size: true,
            checksumSha256: true,
            width: true,
            height: true,
            favorite: true,
            phash: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (page.length === 0) break;

        const tagRows: Array<{ assetId: string; tag: { name: string } }> =
          await db.assetTag.findMany({
            where: { assetId: { in: page.map((asset) => asset.id) } },
            select: { assetId: true, tag: { select: { name: true } } },
          });
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
          emit(`${streamedAssets > 0 ? ',' : ''}${JSON.stringify(entry)}`);
          streamedAssets += 1;
        }

        if (page.length < EXPORT_SCAN_PAGE_SIZE) break;
        cursor = page[page.length - 1].id;
      }

      emit(']}');

      if (canceled) return;
      if (onComplete) {
        await onComplete(bytesStreamed);
      }
      controller.close();
    } catch (error) {
      if (!canceled) {
        controller.error(error);
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      void run(controller);
    },
    cancel() {
      canceled = true;
    },
  });
}
