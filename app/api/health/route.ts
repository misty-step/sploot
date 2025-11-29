import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { kv } from '@vercel/kv';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import pkg from '@/package.json';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  dependencies?: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
  diagnostics?: {
    prisma_connection_test?: boolean;
    database_url_configured?: boolean;
    connection_latency_ms?: number;
    env_vars?: Record<string, 'configured' | 'missing'>;
  };
  version?: string;
  error?: string;
}

const TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<{
  success: boolean;
  error?: string;
  latency_ms?: number;
  prisma_test?: boolean;
}> {
  const start = Date.now();

  try {
    if (!prisma) {
      return {
        success: false,
        error: 'Prisma client not initialized',
        prisma_test: false,
      };
    }

    // Prisma-specific connection test
    await prisma.$queryRaw`SELECT 1`;
    const latency_ms = Date.now() - start;

    return {
      success: true,
      latency_ms,
      prisma_test: true,
    };
  } catch (e) {
    const err = e as Error;
    const latency_ms = Date.now() - start;
    logger.logError('health-check-database-failed', err, {});

    return {
      success: false,
      error: err.message,
      latency_ms,
      prisma_test: false,
    };
  }
}

async function checkRedis(): Promise<boolean> {
  // Skip Redis check if not configured (treat as healthy)
  if (!process.env.KV_REST_API_URL) {
    return true;
  }

  try {
    await kv.ping();
    return true;
  } catch (e) {
    logger.logError('health-check-redis-failed', e as Error, {});
    return false;
  }
}

async function getHandler(_req: NextRequest) {
  const timestamp = new Date().toISOString();

  // Timeout wrapper
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{
    db: { success: boolean; error?: string; latency_ms?: number; prisma_test?: boolean };
    redis: boolean;
  }>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Health check timeout')), TIMEOUT_MS);
  });

  try {
    const checksPromise = Promise.all([checkDatabase(), checkRedis()]).then(
      ([db, redis]) => ({ db, redis })
    );

    const results = await Promise.race([checksPromise, timeoutPromise]);

    // Clear timeout on successful completion
    if (timeoutId) clearTimeout(timeoutId);

    const isHealthy = results.db.success && results.redis;

    // Environment variable visibility (DB-only for reduced information disclosure)
    const envVars: Record<string, 'configured' | 'missing'> = {
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
    };

    if (isHealthy) {
      const payload: HealthStatus = {
        status: 'ok',
        timestamp,
        dependencies: {
          database: 'up',
          redis: 'up',
        },
        diagnostics: {
          prisma_connection_test: results.db.prisma_test,
          database_url_configured: !!process.env.DATABASE_URL,
          connection_latency_ms: results.db.latency_ms,
          env_vars: envVars,
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
      if (!results.db.success) errorMsg.push(`Database connection failed: ${results.db.error}`);
      if (!results.redis) errorMsg.push('Redis connection failed');

      const payload: HealthStatus = {
        status: 'error',
        timestamp,
        error: errorMsg.join(', '),
        diagnostics: {
          prisma_connection_test: results.db.prisma_test,
          database_url_configured: !!process.env.DATABASE_URL,
          connection_latency_ms: results.db.latency_ms,
          env_vars: envVars,
        },
      };

      return NextResponse.json(payload, {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

  } catch (error) {
    // Clear timeout on error
    if (timeoutId) clearTimeout(timeoutId);

    // Timeout or other unexpected error
    const payload: HealthStatus = {
      status: 'error',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
      diagnostics: {
        database_url_configured: !!process.env.DATABASE_URL,
        env_vars: {
          DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
        },
      },
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
    headers: {
      'Cache-Control': res.headers.get('Cache-Control') || 'no-cache, no-store, must-revalidate',
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
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
