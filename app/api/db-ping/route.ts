import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { databaseConfigured } from '@/lib/env';
import { getDbFingerprint } from '@/lib/db-fingerprint';
import { withObservability } from '@/lib/with-observability';

function hasChannelBinding(url: string | undefined | null) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const cb = u.searchParams.get('channel_binding');
    return cb?.toLowerCase() === 'require';
  } catch {
    return false;
  }
}

async function handler() {
  const start = Date.now();
  const envUrl = process.env.DATABASE_URL;

  const fingerprint = getDbFingerprint(envUrl);
  const response: Record<string, unknown> = {
    databaseConfigured,
    prismaLoaded: Boolean(prisma),
    urlHasChannelBinding: hasChannelBinding(envUrl),
    fingerprint,
  };

  if (!prisma) {
    return NextResponse.json(
      { status: 'no-prisma', ...response },
      { status: 503 },
    );
  }

  try {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    const durationMs = Date.now() - start;
    return NextResponse.json({
      status: 'ok',
      durationMs,
      result,
      ...response,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    return NextResponse.json({
      status: 'error',
      durationMs,
      error: String(error),
      ...response,
    }, { status: 503 });
  }
}

export const GET = withObservability(handler, { operation: 'db:ping' });
