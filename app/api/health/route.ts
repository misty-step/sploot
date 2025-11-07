import { NextRequest, NextResponse } from 'next/server';
import { withObservability } from '@/lib/with-observability';

async function getHandler(_req: NextRequest) {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    }
  );
}

async function headHandler(_req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  });
}

export const GET = withObservability(getHandler, {
  operation: 'health:ping',
  skipTiming: true,
});

export const HEAD = withObservability(headHandler, {
  operation: 'health:ping-head',
  skipTiming: true,
  skipLogging: true,
});
