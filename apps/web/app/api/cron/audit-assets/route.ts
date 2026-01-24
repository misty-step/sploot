import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';

interface AuditStats {
  totalAssets: number;
  validCount: number;
  brokenCount: number;
  errorCount: number;
  usersAffected: number;
  brokenAssetIds: string[];
}

interface UserAuditResult {
  userId: string;
  brokenCount: number;
  brokenAssets: Array<{
    id: string;
    blobUrl: string;
    filename: string;
  }>;
}

/**
 * GET /api/cron/audit-assets
 *
 * Daily cron job to audit all blob URLs across all users.
 * Detects broken blobs (404/403) and logs alerts if >10 broken assets found.
 *
 * Authorization: Uses Bearer token from CRON_SECRET environment variable
 * Schedule: Daily via Vercel Cron (configured in vercel.json)
 */
async function getHandler(request: NextRequest) {
  const startTime = Date.now();
  const stats: AuditStats = {
    totalAssets: 0,
    validCount: 0,
    brokenCount: 0,
    errorCount: 0,
    usersAffected: 0,
    brokenAssetIds: [],
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

    // Fetch all non-deleted assets across all users
    const assets = await prisma.asset.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        blobUrl: true,
        pathname: true,
        ownerUserId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    stats.totalAssets = assets.length;
    logger.logInfo('cron.audit-assets.start', {
      totalAssets: assets.length,
    });

    if (assets.length === 0) {
      return NextResponse.json({
        message: 'No assets to audit',
        stats,
        totalTime: Date.now() - startTime,
      });
    }

    // Track broken assets per user for reporting
    const userAuditMap = new Map<string, UserAuditResult>();

    // Validate each blob URL with HEAD request
    for (const asset of assets) {
      try {
        // Use HEAD request to check if blob exists without downloading
        const response = await fetch(asset.blobUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (response.ok) {
          stats.validCount++;
        } else {
          // 404 (Not Found), 403 (Forbidden), or other error status
          stats.brokenCount++;
          stats.brokenAssetIds.push(asset.id);

          // Track per user
          if (!userAuditMap.has(asset.ownerUserId)) {
            userAuditMap.set(asset.ownerUserId, {
              userId: asset.ownerUserId,
              brokenCount: 0,
              brokenAssets: [],
            });
          }

          const userResult = userAuditMap.get(asset.ownerUserId)!;
          userResult.brokenCount++;
          userResult.brokenAssets.push({
            id: asset.id,
            blobUrl: asset.blobUrl,
            filename: asset.pathname.split('/').pop() || asset.pathname,
          });
        }
      } catch (err) {
        // Network error, timeout, or other fetch failure
        stats.errorCount++;
        logger.logError('cron:audit-assets:asset-check-failed', err as Error, { assetId: asset.id });
      }
    }

    stats.usersAffected = userAuditMap.size;
    const totalTime = Date.now() - startTime;

    // Log summary
    const percentBroken = stats.totalAssets > 0
      ? ((stats.brokenCount / stats.totalAssets) * 100).toFixed(2)
      : '0.00';

    logger.logInfo('cron.audit-assets.complete', {
      totalTimeMs: totalTime,
      totalAssets: stats.totalAssets,
      valid: stats.validCount,
      broken: stats.brokenCount,
      errors: stats.errorCount,
      percentBroken,
      usersAffected: stats.usersAffected,
    });

    // ALERT: If >10 broken blobs found, log detailed alert
    if (stats.brokenCount > 10) {
      logger.logError('cron:audit-assets:broken-blobs-alert', new Error('Critical: >10 broken blobs detected'), {
        brokenCount: stats.brokenCount,
        usersAffected: stats.usersAffected,
        affectedUsers: Array.from(userAuditMap.entries()).map(([userId, result]) => ({
          userId,
          brokenCount: result.brokenCount,
          sampleAssets: result.brokenAssets.slice(0, 3).map(a => a.id),
        })),
      });
    }

    // Return detailed stats
    return NextResponse.json({
      message: `Audited ${stats.totalAssets} assets`,
      stats: {
        ...stats,
        totalTime,
        percentBroken,
      },
      alert: stats.brokenCount > 10 ? 'Critical: >10 broken blobs detected' : null,
      affectedUsers: Array.from(userAuditMap.entries()).map(([userId, result]) => ({
        userId,
        brokenCount: result.brokenCount,
      })),
    });
  } catch (error) {
    logger.logError('cron:audit-assets:failed', error as Error);
    return NextResponse.json(
      {
        error: 'Failed to audit assets',
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
  operation: 'cron:audit-assets',
});
