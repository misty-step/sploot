import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withCronAuth } from '@/lib/auth/with-cron-auth';
import { processStorageCleanup } from '@/lib/storage/cleanup-outbox';
import { withObservability } from '@/lib/with-observability';

const MAX_BATCH = 100;

/**
 * Authenticated scheduler entrypoint for provider-neutral storage cleanup.
 * Each row carries its provider and physical URL/key; the worker never casts
 * an inactive legacy replica to the configured target store.
 */
async function getHandler(request: NextRequest) {
  if (!prisma) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

  const requested = new URL(request.url).searchParams.get('limit');
  const limit = requested === null ? 100 : Number(requested);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BATCH) {
    return NextResponse.json({ error: 'limit must be an integer from 1 to 100' }, { status: 400 });
  }

  try {
    const result = await processStorageCleanup(prisma, limit);
    return NextResponse.json({ message: 'Storage cleanup batch processed', ...result });
  } catch (error) {
    return NextResponse.json({ error: 'Storage cleanup unavailable', detail: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}

export const GET = withObservability(withCronAuth(getHandler), { operation: 'cron:process-storage-cleanup' });
