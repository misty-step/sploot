import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { kv } from '@vercel/kv';
import { withObservability } from '@/lib/with-observability';
import pkg from '@/package.json';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  dependencies?: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
  version?: string;
  error?: string;
}

const TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<boolean> {
  if (!prisma) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (e) {
    console.error('Database health check failed:', e);
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    await kv.ping();
    return true;
  } catch (e) {
    console.error('Redis health check failed:', e);
    return false;
  }
}

async function getHandler(_req: NextRequest) {
  const timestamp = new Date().toISOString();

  // Timeout wrapper
  const timeoutPromise = new Promise<{ db: boolean; redis: boolean }>((_, reject) => {
    setTimeout(() => reject(new Error('Health check timeout')), TIMEOUT_MS);
  });

  try {
    const checksPromise = Promise.all([checkDatabase(), checkRedis()]).then(
      ([db, redis]) => ({ db, redis })
    );

    const results = await Promise.race([checksPromise, timeoutPromise]);

    const isHealthy = results.db && results.redis;
    const status = isHealthy ? 200 : 503;

    if (isHealthy) {
      const payload: HealthStatus = {
        status: 'ok',
        timestamp,
        dependencies: {
          database: 'up',
          redis: 'up',
        },
        version: pkg.version,
      };

      return NextResponse.json(payload, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } else {
      // Determine which failed
      const errorMsg = [];
      if (!results.db) errorMsg.push('Database connection failed');
      if (!results.redis) errorMsg.push('Redis connection failed');

      const payload: HealthStatus = {
        status: 'error',
        timestamp,
        error: errorMsg.join(', '),
      };

      return NextResponse.json(payload, {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

  } catch (error) {
    // Timeout or other unexpected error
    const payload: HealthStatus = {
      status: 'error',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return NextResponse.json(payload, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}

async function headHandler(req: NextRequest) {
  const res = await getHandler(req);
  return new NextResponse(null, {
    status: res.status,
    headers: res.headers,
  });
}

export const GET = withObservability(getHandler, {
  operation: 'health:check',
  skipTiming: true,
});

export const HEAD = withObservability(headHandler, {
  operation: 'health:check-head',
  skipTiming: true,
  skipLogging: true,
});
