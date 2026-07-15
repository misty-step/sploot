import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi, type AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { getStorageQuotaSnapshot } from '@/lib/quota/storage-quota-policy';

/**
 * GET /api/stats
 *
 * Lightweight per-user stats:
 * - assetCount: total non-deleted assets
 * - storageBytes: sum of asset sizes
 * - storageLimitBytes: quota limit in bytes
 * - storageRemainingBytes: available storage in bytes
 * - storageUsagePercent: quota usage percentage
 * - lastUploadAt: ISO timestamp of most recent asset (or null)
 *
 * Single asset aggregate plus quota snapshot.
 */
async function getHandler(_req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 503 }
      );
    }

    const aggregate = await prisma.asset.aggregate({
      where: {
        ownerUserId: userId,
        deletedAt: null,
      },
      _count: { id: true },
      _sum: { size: true },
      _max: { createdAt: true },
    });

    const assetCount = aggregate._count.id;
    const storageBytes = aggregate._sum.size ?? 0;
    const quota = await getStorageQuotaSnapshot(userId);
    const storageLimitBytes = quota.limitBytes;
    const storageRemainingBytes = Math.max(0, quota.limitBytes - storageBytes - (quota.reservedBytes ?? 0));
    const storageUsagePercent = storageLimitBytes > 0
      ? Math.min(100, Math.round((storageBytes / storageLimitBytes) * 1000) / 10)
      : 0;
    const lastUploadAt = aggregate._max.createdAt
      ? aggregate._max.createdAt.toISOString()
      : null;

    return NextResponse.json(
      {
        assetCount,
        storageBytes,
        storageLimitBytes,
        storageRemainingBytes,
        storageUsagePercent,
        lastUploadAt,
      },
      { status: 200 }
    );
  } catch (error) {
    logError('stats:get-failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(
  withAuthenticatedApi(getHandler, { requireUserSync: true }),
  { operation: 'stats:get' }
);
