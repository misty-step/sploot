import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { del as deleteBlob } from '@vercel/blob';
import { headers } from 'next/headers';
import { withObservability } from '@/lib/with-observability';

interface PurgeStats {
  totalFound: number;
  purgedCount: number;
  failedCount: number;
  blobsDeleted: number;
  errors: Array<{ assetId: string; error: string }>;
}

/**
 * GET /api/cron/purge-deleted-assets
 *
 * Cron job to permanently delete soft-deleted assets older than 30 days.
 * This provides a recovery window before permanent deletion.
 *
 * Process:
 * 1. Find assets with deletedAt > 30 days ago
 * 2. Delete associated blobs from Vercel Blob storage
 * 3. Delete database records (cascades to embeddings and tags)
 *
 * Authorization: Uses Bearer token from CRON_SECRET environment variable
 * Schedule: Daily via Vercel Cron (configured in vercel.json)
 */
async function getHandler(request: NextRequest) {
  const startTime = Date.now();
  const stats: PurgeStats = {
    totalFound: 0,
    purgedCount: 0,
    failedCount: 0,
    blobsDeleted: 0,
    errors: [],
  };

  try {
    // Verify cron authorization - required in all environments
    const authHeader = (await headers()).get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Calculate cutoff date: 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Find soft-deleted assets older than 30 days
    const assetsToDelete = await prisma.asset.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: thirtyDaysAgo,
        },
      },
      select: {
        id: true,
        blobUrl: true,
        thumbnailUrl: true,
        pathname: true,
        deletedAt: true,
        ownerUserId: true,
      },
    });

    stats.totalFound = assetsToDelete.length;
    console.log(`[cron] Found ${stats.totalFound} assets to purge (deleted >${thirtyDaysAgo.toISOString()})`);

    if (stats.totalFound === 0) {
      return NextResponse.json({
        message: 'No assets need purging',
        stats,
        totalTime: Date.now() - startTime,
      });
    }

    // Process each asset
    for (const asset of assetsToDelete) {
      try {
        console.log(`[cron] Purging asset ${asset.id} (deleted ${asset.deletedAt})`);

        // Delete blobs from Vercel Blob storage
        const blobUrls = [asset.blobUrl];
        if (asset.thumbnailUrl) {
          blobUrls.push(asset.thumbnailUrl);
        }

        for (const blobUrl of blobUrls) {
          try {
            await deleteBlob(blobUrl);
            stats.blobsDeleted++;
            console.log(`[cron]   Deleted blob: ${blobUrl}`);
          } catch (blobError) {
            // Log but continue - blob might already be deleted
            console.warn(`[cron]   Failed to delete blob ${blobUrl}:`, blobError);
          }
        }

        // Delete from database (cascades to embeddings and tags via schema)
        await prisma.asset.delete({
          where: { id: asset.id },
        });

        stats.purgedCount++;
        console.log(`[cron]   Successfully purged asset ${asset.id}`);
      } catch (error) {
        stats.failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({
          assetId: asset.id,
          error: errorMessage,
        });
        console.error(`[cron]   Failed to purge asset ${asset.id}:`, error);

        // Continue processing other assets even if one fails
        continue;
      }
    }

    const totalTime = Date.now() - startTime;
    const successRate = stats.totalFound > 0
      ? Math.round((stats.purgedCount / stats.totalFound) * 100)
      : 0;

    console.log(`[cron] Purge complete:`, {
      totalTime: `${totalTime}ms`,
      found: stats.totalFound,
      purged: stats.purgedCount,
      failed: stats.failedCount,
      blobsDeleted: stats.blobsDeleted,
      successRate: `${successRate}%`,
    });

    return NextResponse.json({
      message: `Purged ${stats.purgedCount} of ${stats.totalFound} assets`,
      stats: {
        ...stats,
        totalTime,
        successRate,
        cutoffDate: thirtyDaysAgo.toISOString(),
      },
    });
  } catch (error) {
    console.error('[cron] Unexpected error in purge-deleted-assets:', error);
    return NextResponse.json(
      {
        error: 'Failed to purge deleted assets',
        stats,
        // Only include error details in development for debugging
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : 'Unknown error')
          : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, {
  operation: 'cron:purge-deleted-assets',
});
