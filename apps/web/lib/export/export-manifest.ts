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

function requireDb(): NonNullable<typeof prisma> {
  if (!prisma) {
    throw new Error('library export requires a configured database');
  }
  return prisma;
}

export function streamExportManifest(
  options: StreamExportManifestOptions,
): ReadableStream<Uint8Array> {
  const { row, onComplete } = options;
  const encoder = new TextEncoder();
  let canceled = false;

  async function run(controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> {
    const db = requireDb();
    let bytesStreamed = 0;

    const emit = (text: string) => {
      if (canceled) return;
      const chunk = encoder.encode(text);
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
      const served = new Set(row.servedParts);

      const tags: Array<{ name: string; color: string | null }> = await db.tag.findMany({
        where: { ownerUserId: row.ownerUserId },
        orderBy: { name: 'asc' },
        select: { name: true, color: true },
      });

      const head = {
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
        tags,
      };

      // Open the assets array by splicing into the serialized head object.
      emit(`${JSON.stringify(head).slice(0, -1)},"assets":[`);

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
          const entry = {
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
