import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { del as deleteBlob } from '@vercel/blob';
import { headers } from 'next/headers';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';

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
    logger.logInfo('cron.purge-deleted-assets.start', {
      totalFound: stats.totalFound,
      cutoffIso: thirtyDaysAgo.toISOString(),
    });

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
        logger.logInfo('cron.purge-deleted-assets.asset-start', {
          assetId: asset.id,
          deletedAt: asset.deletedAt,
        });

        // Delete blobs from Vercel Blob storage
        const blobUrls = [asset.blobUrl];
        if (asset.thumbnailUrl) {
          blobUrls.push(asset.thumbnailUrl);
        }

        for (const blobUrl of blobUrls) {
          try {
            await deleteBlob(blobUrl);
            stats.blobsDeleted++;
            logger.logInfo('cron.purge-deleted-assets.blob-deleted', {
              assetId: asset.id,
              blobUrl,
            });
          } catch (blobError) {
            // Log but continue - blob might already be deleted
            logger.logError('cron:purge-deleted-assets:blob-delete-failed', blobError as Error, { assetId: asset.id, blobUrl });
          }
        }

        // Delete from database (cascades to embeddings and tags via schema)
        await prisma.asset.delete({
          where: { id: asset.id },
        });

        stats.purgedCount++;
        logger.logInfo('cron.purge-deleted-assets.asset-success', {
          assetId: asset.id,
        });
      } catch (error) {
        stats.failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({
          assetId: asset.id,
          error: errorMessage,
        });
        logger.logError('cron:purge-deleted-assets:asset-failed', error as Error, { assetId: asset.id });

        // Continue processing other assets even if one fails
        continue;
      }
    }

    const totalTime = Date.now() - startTime;
    const successRate = stats.totalFound > 0
      ? Math.round((stats.purgedCount / stats.totalFound) * 100)
      : 0;

    logger.logInfo('cron.purge-deleted-assets.complete', {
      totalTimeMs: totalTime,
      found: stats.totalFound,
      purged: stats.purgedCount,
      failed: stats.failedCount,
      blobsDeleted: stats.blobsDeleted,
      successRate,
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
    logger.logError('cron:purge-deleted-assets:failed', error as Error);
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
