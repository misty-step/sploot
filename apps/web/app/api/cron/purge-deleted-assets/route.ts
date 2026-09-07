import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ConfiguredStorageWriter } from '@/lib/storage/object-store';
import { enqueueAssetReplicaCleanup, markReplicaCleanupDone } from '@/lib/storage/permanent-delete';
import { withCronAuth } from '@/lib/auth/with-cron-auth';
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
 * Authorization: Bearer token from CRON_SECRET (withCronAuth)
 * Schedule: Daily via the production scheduler (declared in cron-schedules.json)
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
    if (!prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    const storage = new ConfiguredStorageWriter();

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
        storageProvider: true,
        storageKey: true,
        storageSourceKey: true,
        thumbnailStorageKey: true,
        thumbnailStorageSourceKey: true,
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

    // Enqueue and delete every provider replica through the shared transaction seam.
    for (const asset of assetsToDelete) {
      try {
        logger.logInfo('cron.purge-deleted-assets.asset-start', { assetId: asset.id, deletedAt: asset.deletedAt });
        const tombstone = await prisma.$transaction(async (tx) => {
          const locked = await tx.asset.findFirst({ where: { id: asset.id, deletedAt: { not: null, lt: thirtyDaysAgo } } });
          if (!locked) return null;
          const fallback = [
            { provider: locked.storageProvider ?? 'vercel', key: locked.storageSourceKey ?? locked.storageKey ?? locked.pathname, url: locked.blobUrl },
            locked.thumbnailUrl ? { provider: locked.storageProvider ?? 'vercel', key: locked.thumbnailStorageSourceKey ?? locked.thumbnailStorageKey ?? locked.thumbnailPath ?? locked.pathname, url: locked.thumbnailUrl } : null,
          ].filter((entry): entry is { provider: string; key: string; url: string } => Boolean(entry));
          const replicas = await enqueueAssetReplicaCleanup(tx, locked.id, fallback);
          return { replicas };
        });
        if (!tombstone) continue;

        for (const replica of tombstone.replicas) {
          if (storage.deleteReplica) await storage.deleteReplica(replica);
          else if (storage.deleteKey) await storage.deleteKey(replica.provider, replica.key);
          else await storage.deleteUrl(replica.url);
          stats.blobsDeleted++;
          logger.logInfo('cron.purge-deleted-assets.blob-deleted', { assetId: asset.id, provider: replica.provider, key: replica.key });
        }

        await prisma.$transaction(async (tx) => {
          const locked = await tx.asset.findFirst({ where: { id: asset.id, deletedAt: { not: null, lt: thirtyDaysAgo } } });
          if (!locked) return;
          await markReplicaCleanupDone(tx, asset.id, tombstone.replicas);
          await tx.asset.delete({ where: { id: asset.id } });
        });
        stats.purgedCount++;
        logger.logInfo('cron.purge-deleted-assets.asset-success', { assetId: asset.id });
      } catch (error) {
        stats.failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({ assetId: asset.id, error: errorMessage });
        logger.logError('cron:purge-deleted-assets:asset-failed', error as Error, { assetId: asset.id });
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

export const GET = withObservability(withCronAuth(getHandler), {
  operation: 'cron:purge-deleted-assets',
});
