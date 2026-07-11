import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { put, del } from '@vercel/blob';
import sharp from 'sharp';
import { prisma } from '@/lib/db';
import { generateThumbnail } from '@/lib/image-processing';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';

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
 * Authorization: Bearer token from CRON_SECRET (same contract as the other
 * cron routes; triggerable as a DigitalOcean job where $CRON_SECRET
 * resolves). Batched via limit/cursor so a driver loops until done.
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
  const authHeader = (await headers()).get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const limit = Math.min(
    Math.max(Number(params.get('limit')) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const cursor = params.get('cursor');

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

      const thumbRes = await fetch(asset.thumbnailUrl!);
      if (thumbRes.ok) {
        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
        const thumbMeta = await sharp(thumbBuffer).metadata();
        if (!thumbMeta.width || !thumbMeta.height) throw new Error('thumbnail unreadable');

        const thumbAspect = thumbMeta.width / thumbMeta.height;
        if (Math.abs(thumbAspect - originalAspect) / originalAspect <= ASPECT_TOLERANCE) {
          alreadyCorrect++;
          continue;
        }
      } else if (thumbRes.status !== 404) {
        throw new Error(`thumbnail fetch ${thumbRes.status}`);
      }

      // Legacy crop confirmed — regenerate from the original.
      const originalRes = await fetch(asset.blobUrl);
      if (!originalRes.ok) throw new Error(`original fetch ${originalRes.status}`);
      const originalBuffer = Buffer.from(await originalRes.arrayBuffer());

      const format = formatForMime(asset.mime);
      const newThumb = await generateThumbnail(originalBuffer, format);
      const blob = await put(thumbPathname(asset.pathname, format), newThumb, {
        access: 'public',
        // fresh pathname per run — old CDN entries can't shadow the fix
        addRandomSuffix: true,
        contentType: `image/${format === 'jpeg' ? 'jpeg' : format}`,
      });

      const oldThumbUrl = asset.thumbnailUrl!;
      await prisma.asset.update({
        where: { id: asset.id },
        data: { thumbnailUrl: blob.url, thumbnailPath: blob.pathname },
      });

      // best-effort: drop the orphaned cropped thumbnail
      try {
        await del(oldThumbUrl);
      } catch {
        // orphan cleanup is non-critical; audit-assets sweeps blobs daily
      }

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

export const GET = withObservability(getHandler, {
  operation: 'cron:regenerate-thumbnails',
});
