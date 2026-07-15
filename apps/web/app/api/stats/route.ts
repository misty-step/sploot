import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { getStorageQuotaSnapshot } from '@/lib/quota/storage-quota-policy';
import { enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';

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
async function getHandler(_req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();

    if (!prisma) {
      return enrollmentUnavailableResponse();
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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    logError('stats:get-failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'stats:get' });
