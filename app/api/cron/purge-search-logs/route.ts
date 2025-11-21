import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';

/**
 * GET /api/cron/purge-search-logs
 *
 * Deletes search_logs older than 30 days.
 * Authorization: Bearer token via CRON_SECRET env.
 */
async function getHandler(_req: NextRequest) {
  const start = Date.now();

  try {
    const authHeader = (await headers()).get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    const expected = `Bearer ${cronSecret}`;
    const isValid =
      typeof authHeader === 'string' &&
      authHeader.length === expected.length &&
      timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));

    if (!isValid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      );
    }

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.searchLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    const durationMs = Date.now() - start;

    logger.logInfo('cron.purge-search-logs.complete', {
      deleted: result.count,
      cutoff: cutoff.toISOString(),
      durationMs,
    });

    return NextResponse.json({
      deleted: result.count,
      cutoff: cutoff.toISOString(),
      durationMs,
    });
  } catch (error) {
    logger.logError('cron.purge-search-logs.error', error, {
      durationMs: Date.now() - start,
    });

    return NextResponse.json(
      { error: 'Failed to purge search logs' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, {
  operation: 'cron:purge-search-logs',
});
