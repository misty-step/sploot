import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { generateThumbnail } from '@/lib/image-processing';
import { withCronAuth } from '@/lib/auth/with-cron-auth';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import { ConfiguredStorageWriter, bodyToBuffer, ObjectNotFoundError } from '@/lib/storage/object-store';
import { storageConfigFromEnv, storageConfigFingerprint } from '@/lib/storage/config';
import { enqueueReplicaCleanup, markReplicaCleanupDone } from '@/lib/storage/permanent-delete';
import { admitCost, CostAdmissionError, costAdmissionErrorResponse } from '@/lib/cost';

/**
 * GET /api/cron/regenerate-thumbnails?limit=25&cursor=<assetId>
 *
 * Backfill for backlog 058: thumbnails generated before the fit:'inside'
 * fix (2026-07-10, d27ffad) are square center-crops — the grid shows those
 * memes cropped forever until their stored thumbnail file is regenerated
 * from the original. CSS cannot uncrop a cropped file.
 *
 * For each candidate asset the stored thumbnail's real aspect is compared
 * against the original's stored width/height; on mismatch (>2%) the
 * thumbnail is regenerated from the original blob, uploaded under a fresh
 * pathname (cache-safe), the asset row updated, and the old blob deleted
 * best-effort. Idempotent: already-correct thumbnails are skipped, so
 * repeated runs converge to all-skips.
 *
 * Authorization: Bearer token from CRON_SECRET via withCronAuth (same contract
 * as the other cron routes; triggerable as a DigitalOcean job where
 * $CRON_SECRET resolves). Batched via limit/cursor so a driver loops until
 * done.
 */

const ASPECT_TOLERANCE = 0.02;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const SUPPORTED_THUMBNAIL_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

type OutputFormat = 'jpeg' | 'webp' | 'png';

function formatForMime(mime: string): OutputFormat {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  return 'jpeg';
}

function thumbPathname(pathname: string, format: OutputFormat): string {
  const extension = format === 'jpeg' ? 'jpg' : format;
  if (/\.[^/.]+$/.test(pathname)) {
    return pathname.replace(/\.[^/.]+$/, `-thumb.${extension}`);
  }
  return `${pathname}-thumb.${extension}`;
}

async function getHandler(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  // System-triggered Blob spend, not attributable to one requesting user.
  // Gated on the operator emergency-stop kill switch only (see
  // apps/web/lib/cost/kernel.ts); a per-account budget does not apply to a
  // cron sweep across every owner's assets.
  try {
    await admitCost({ capability: 'blob_write', userId: 'system:cron:regenerate-thumbnails' });
  } catch (error) {
    if (error instanceof CostAdmissionError) {
      return costAdmissionErrorResponse(error);
    }
    throw error;
  }

  const params = request.nextUrl.searchParams;
  const limit = Math.min(
    Math.max(Number(params.get('limit')) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const cursor = params.get('cursor');
  const storage = new ConfiguredStorageWriter();
  const configFingerprint = storageConfigFingerprint(storageConfigFromEnv());

  const candidates = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      thumbnailUrl: { not: null },
      width: { gt: 0 },
      height: { gt: 0 },
      mime: { in: SUPPORTED_THUMBNAIL_MIMES },
    },
    orderBy: { id: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      blobUrl: true,
      thumbnailUrl: true,
      pathname: true,
      storageProvider: true,
      storageKey: true,
      storageSourceKey: true,
      thumbnailStorageKey: true,
      thumbnailStorageSourceKey: true,
      thumbnailPath: true,
      mime: true,
      width: true,
      height: true,
    },
  });

  const hasMore = candidates.length > limit;
  const batch = candidates.slice(0, limit);

  let regenerated = 0;
  let alreadyCorrect = 0;
  let failed = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const asset of batch) {
    try {
      const originalAspect = asset.width! / asset.height!;

      let thumbBuffer: Buffer | null = null;
      try {
        const thumbnailKey = asset.storageProvider === 'vercel' ? (asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath) : (asset.thumbnailStorageKey ?? asset.thumbnailPath);
        const thumbnail = await storage.get(thumbnailKey ?? asset.thumbnailUrl!);
        thumbBuffer = await bodyToBuffer(thumbnail.body, 512 * 1024 * 1024);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) throw error;
      }
      if (thumbBuffer) {
        const thumbMeta = await sharp(thumbBuffer).metadata();
        if (!thumbMeta.width || !thumbMeta.height) throw new Error('thumbnail unreadable');
        const thumbAspect = thumbMeta.width / thumbMeta.height;
        if (Math.abs(thumbAspect - originalAspect) / originalAspect <= ASPECT_TOLERANCE) {
          alreadyCorrect++;
          continue;
        }
      }

      // Legacy crop confirmed — regenerate from the original through the configured reader.
      const originalKey = asset.storageProvider === 'vercel' ? (asset.storageSourceKey ?? asset.storageKey ?? asset.pathname) : (asset.storageKey ?? asset.pathname);
      const original = await storage.get(originalKey);
      const originalBuffer = await bodyToBuffer(original.body, 512 * 1024 * 1024);
      const format = formatForMime(asset.mime);
      const newThumb = await generateThumbnail(originalBuffer, format);
      const key = thumbPathname(asset.pathname, format) + '-' + randomUUID();
      const metadata = { size: newThumb.byteLength, sha256: createHash('sha256').update(newThumb).digest('hex'), contentType: 'image/' + (format === 'jpeg' ? 'jpeg' : format) };
      const blob = await storage.put(key, newThumb, metadata);
      const oldThumbUrl = asset.thumbnailUrl!;
      // Match the read-path provider preference above: for a legacy Vercel
      // asset the raw source key (not the inventoried logical key) is the
      // real deletable pathname.
      const oldThumbKey = asset.storageProvider === 'vercel'
        ? (asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath ?? '')
        : (asset.thumbnailStorageKey ?? asset.thumbnailPath ?? '');
      const oldThumb = { provider: asset.storageProvider, key: oldThumbKey, url: oldThumbUrl };
      const newReplicas = blob.replicas ?? [{ provider: blob.provider, key: blob.key, url: blob.url }];
      // Unix-seconds generation: fits int4, is monotonic, and always
      // outranks both upload's default generation 0 and cutover's small
      // sequential counter (state.generation + 1) in every `ORDER BY
      // generation DESC LIMIT 1` source-replica lookup a later cutover
      // performs — so a pre-cutover regen correctly supersedes the stale
      // (already-deleted) original thumbnail object as the recorded source.
      // Reading the real next generation is not an option here: the app
      // role's SELECT grant on this table is column-restricted and excludes
      // `generation` (see stripe-ledger-bootstrap-post.sql).
      const regenGeneration = Math.floor(Date.now() / 1000);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.asset.update({
            where: { id: asset.id },
            data: {
              thumbnailUrl: blob.url,
              thumbnailPath: blob.key,
              thumbnailStorageKey: blob.key,
              thumbnailStorageSourceKey: null,
              thumbnailStorageSize: blob.metadata.size,
              thumbnailStorageSha256: blob.metadata.sha256,
              storageConfigFingerprint: configFingerprint,
            },
          });
          // Insert-only: the app runtime role has no UPDATE/DELETE grant on
          // this ledger, so the superseded row is left in place rather than
          // deactivated. permanent-delete's replicasForPermanentDelete
          // treats every row as authoritative regardless of `active`, so the
          // old object still gets tombstoned for cleanup; without this
          // insert the *new* thumbnail object would have no replica row at
          // all once any row exists for this asset, and would leak forever
          // on permanent delete.
          // No skipDuplicates: the (assetId, rendition, generation, provider)
          // unique constraint is our only collision guard against two
          // concurrent regen attempts for the same asset within the same
          // wall-clock second (both would compute an identical
          // regenGeneration). Silently skipping a colliding insert would
          // let the transaction commit with the asset pointed at a new
          // object that has no ledger row — exactly the leak this insert
          // exists to prevent. Letting the unique-constraint violation
          // throw instead rolls back this entire transaction (including
          // the asset.update above), so the loser is cleanly retried on
          // the next cron pass with a fresh generation a second later.
          await tx.assetStorageReplica.createMany({
            data: newReplicas.map((replica) => ({
              assetId: asset.id,
              rendition: 'thumbnail' as const,
              provider: replica.provider,
              sourceKey: replica.provider === 'vercel' ? replica.key : null,
              logicalKey: replica.key,
              deliveryUrl: replica.url,
              size: blob.metadata.size,
              sha256: blob.metadata.sha256,
              contentType: metadata.contentType,
              generation: regenGeneration,
              active: replica.provider === blob.provider,
            })),
          });
        });
      } catch (error) {
        // The just-uploaded replica(s) must be cleaned up, but a failure
        // here must never replace or mask the ORIGINAL transaction error —
        // that's the actionable failure reason (e.g. a permission/DB error),
        // not an artifact of best-effort cleanup. If cleanup itself fails,
        // durably enqueue every new replica through the same
        // storage_cleanup_outbox seam the old-thumbnail-delete path below
        // already uses, so it is retried rather than silently leaked.
        try {
          await storage.deleteReplicas?.(newReplicas);
        } catch (cleanupError) {
          const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          for (const replica of newReplicas) {
            try {
              // Reuse the same shared-reference-aware outbox seam
              // old-thumbnail cleanup uses below, rather than a bespoke
              // insert, so this orphan is retried by the same worker.
              await prisma.$transaction((tx) => enqueueReplicaCleanup(tx, asset.id, replica, 'delete-thumbnail'));
            } catch (enqueueError) {
              // Both the provider cleanup AND the durable outbox insert
              // failed: the just-uploaded object is now leaked with no
              // retry path recorded anywhere. This must never mask
              // `error` (thrown below, unchanged below) but it must also
              // never be silent — emit one explicit structured signal
              // through the shared logger/Canary convention. Never log the
              // delivery URL (provider URLs may carry signed query
              // parameters); key/provider/assetId are enough to locate it.
              logger.logError('storage.regenerate-thumbnails.orphaned-replica-leak', enqueueError instanceof Error ? enqueueError : new Error(String(enqueueError)), {
                assetId: asset.id,
                provider: replica.provider,
                key: replica.key,
                cleanupError: cleanupMessage,
                originalError: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        throw error;
      }
      // Route the old thumbnail through the same shared-reference-aware
      // outbox seam permanent-delete uses: a legacy dedup/cutover asset can
      // still share this exact URL/key with another live asset, and
      // deleting it out from under that sibling would break it
      // deterministically. enqueueReplicaCleanup durably enqueues (fenced,
      // inside its own transaction) BEFORE the best-effort physical
      // attempt, so even an unshared old thumbnail whose immediate delete
      // fails still reaches durable cleanup/retry via process-storage-cleanup.
      const oldThumbCleanupEnqueued = await prisma.$transaction((tx) => enqueueReplicaCleanup(tx, asset.id, oldThumb, 'delete-thumbnail'));
      if (oldThumbCleanupEnqueued) {
        try {
          await storage.deleteUrl(oldThumbUrl);
          await markReplicaCleanupDone(prisma, asset.id, [oldThumb], 'delete-thumbnail');
        } catch (error) {
          // Already durably enqueued above, so process-storage-cleanup will
          // retry this with backoff regardless of the throw below (which
          // still counts this asset as a batch failure, matching the prior
          // best-effort-delete contract).
          throw error;
        }
      }
      // else: hasLiveSharedReference fenced this object — another live
      // asset still references the same legacy thumbnail URL/key, so
      // physical deletion is correctly skipped rather than breaking that
      // sibling asset. It will be cleaned up once nothing live shares it.
      regenerated++;
    } catch (error) {
      failed++;
      failures.push({
        id: asset.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = {
    scanned: batch.length,
    regenerated,
    alreadyCorrect,
    failed,
    failures: failures.slice(0, 10),
    nextCursor: hasMore ? batch[batch.length - 1].id : null,
  };

  logger.logInfo('regenerate-thumbnails batch complete', summary);
  return NextResponse.json(summary);
}

export const GET = withObservability(withCronAuth(getHandler), {
  operation: 'cron:regenerate-thumbnails',
});
