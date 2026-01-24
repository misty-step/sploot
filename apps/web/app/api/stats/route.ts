import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

/**
 * GET /api/stats
 *
 * Lightweight per-user stats:
 * - assetCount: total non-deleted assets
 * - storageBytes: sum of asset sizes
 * - lastUploadAt: ISO timestamp of most recent asset (or null)
 *
 * Single aggregate query, no joins.
 */
async function getHandler(_req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();

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
    const lastUploadAt = aggregate._max.createdAt
      ? aggregate._max.createdAt.toISOString()
      : null;

    return NextResponse.json(
      {
        assetCount,
        storageBytes,
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

export const GET = withObservability(getHandler, { operation: 'stats:get' });
