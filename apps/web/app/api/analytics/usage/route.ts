import { NextRequest, NextResponse } from 'next/server';

import { withAuthenticatedApi, type AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';

const COST_PER_UPLOAD = 0.00022; // $0.00022 per upload

async function getHandler(_req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [uploadsLastHour, uploadsLastDay, uploadsLast7Days] = await Promise.all([
      prisma.asset.count({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          createdAt: {
            gt: oneHourAgo,
          },
        },
      }),
      prisma.asset.count({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          createdAt: {
            gt: twentyFourHoursAgo,
          },
        },
      }),
      prisma.asset.count({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          createdAt: {
            gt: sevenDaysAgo,
          },
        },
      }),
    ]);

    // Sustained pattern detection: compare uploads per hour over last two hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const uploadsByHour = await prisma.asset.findMany({
      where: {
        ownerUserId: userId,
        deletedAt: null,
        createdAt: {
          gt: twoHoursAgo,
        },
      },
      select: {
        createdAt: true,
      },
    });

    const buckets: Record<string, number> = {};
    for (const asset of uploadsByHour) {
      const hourKey = new Date(asset.createdAt);
      hourKey.setMinutes(0, 0, 0);
      const key = hourKey.toISOString();
      buckets[key] = (buckets[key] ?? 0) + 1;
    }

    const sortedBuckets = Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, count]) => count);

    const lastTwoHoursCounts = sortedBuckets.slice(-2);
    const isSustainedHighRate =
      lastTwoHoursCounts.length === 2 && lastTwoHoursCounts.every((count) => count > 200);

    const estimatedCost = Number((uploadsLast7Days * COST_PER_UPLOAD).toFixed(4));

    return NextResponse.json({
      uploadsLastHour,
      uploadsLastDay,
      uploadsLast7Days,
      estimatedCost,
      isSustainedHighRate,
    });
  } catch (error) {
    logError('analytics:usage-failed', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch usage analytics',
        details:
          process.env.NODE_ENV === 'development'
            ? error instanceof Error
              ? error.message
              : 'Unknown error'
            : undefined,
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'analytics:usage' });
