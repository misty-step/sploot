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
    connection_retries?: number;
    env_vars?: Record<string, 'configured' | 'missing'>;
  };
  version?: string;
  error?: string;
}

const TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 100;

interface DatabaseCheckResult {
  success: boolean;
  error?: string;
  latency_ms?: number;
  prisma_test?: boolean;
  retries?: number;
}

// Transient error patterns that should be retried (expected in serverless)
const TRANSIENT_ERROR_PATTERNS = [
  'Server has closed the connection',
  "Can't reach database server",
  'Connection refused',
  'Connection reset',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
];

function isTransientError(error: Error): boolean {
  const message = error.message || '';
  return TRANSIENT_ERROR_PATTERNS.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDatabase(): Promise<DatabaseCheckResult> {
  const start = Date.now();

  if (!prisma) {
    return {
      success: false,
      error: 'Prisma client not initialized',
      prisma_test: false,
    };
  }

  let lastError: Error | null = null;
  let attempts = 0;

  // Retry loop for transient connection errors (common in serverless cold starts)
  while (attempts <= MAX_RETRIES) {
    try {
      // Prisma-specific connection test
      await prisma.$queryRaw`SELECT 1`;
      const latency_ms = Date.now() - start;

      return {
        success: true,
        latency_ms,
        prisma_test: true,
        ...(attempts > 0 && { retries: attempts }),
      };
    } catch (e) {
      lastError = e as Error;
      attempts++;

      // Only retry on transient errors, not on auth/config issues
      if (attempts <= MAX_RETRIES && isTransientError(lastError)) {
        // Exponential backoff: 100ms, 200ms
        await sleep(RETRY_DELAY_MS * attempts);
        continue;
      }

      break;
    }
  }

  const latency_ms = Date.now() - start;
  const err = lastError as Error;

  // Only log to Sentry if NOT a transient error (those are expected in serverless)
  // Transient errors after retries are still logged locally but not to Sentry
  if (!isTransientError(err)) {
    logger.logError('health-check-database-failed', err);
  }

  return {
    success: false,
    error: err.message,
    latency_ms,
    prisma_test: false,
    ...(attempts > 1 && { retries: attempts - 1 }),
  };
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
    logger.logError('health-check-redis-failed', e as Error);
    return false;
  }
}

async function getHandler(_req: NextRequest) {
  const timestamp = new Date().toISOString();

  // Timeout wrapper
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{
    db: DatabaseCheckResult;
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
          ...(results.db.retries && { connection_retries: results.db.retries }),
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
          ...(results.db.retries && { connection_retries: results.db.retries }),
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
