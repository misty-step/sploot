import { NextRequest, NextResponse } from 'next/server';

import pkg from '@/package.json';
import { canaryConfigured, reportCanaryCheckIn } from '@/lib/canary-reporter';
import {
  checkDatabaseReadiness,
  type DatabaseHealth,
} from '@/lib/health/database-readiness';
import { withObservability } from '@/lib/with-observability';

/**
 * Deep readiness oracle: database connectivity, embedding limiter schema, and
 * (when required) the Stripe bootstrap marker. Fails closed with 503.
 *
 * This endpoint is deliberately NOT the platform routing probe. DigitalOcean
 * routes the web service on the shallow /api/health/live liveness endpoint
 * (incident 2026-07-15: routing on this deep oracle turned a database stall
 * into no_healthy_upstream for the whole origin). Deployed verification and
 * operators keep using this endpoint as the readiness authority.
 */

interface HealthDependencies {
  database: 'up' | 'down';
  embedding_limiter: 'up' | 'down';
  share_slug_cache: 'local';
}

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  dependencies: HealthDependencies;
  diagnostics: {
    prisma_connection_test?: boolean;
    embedding_limiter_schema?: boolean;
    database_url_configured: boolean;
    connection_latency_ms?: number;
    env_vars: Record<string, 'configured' | 'missing'>;
    canary_configured: boolean;
  };
  version?: string;
  error?: string;
}

const TIMEOUT_MS = 5_000;

function dependenciesFor(database: DatabaseHealth): HealthDependencies {
  return {
    database: database.success ? 'up' : 'down',
    embedding_limiter: database.success && database.limiterSchema ? 'up' : 'down',
    share_slug_cache: 'local',
  };
}

function diagnosticsFor(database: DatabaseHealth): HealthStatus['diagnostics'] {
  return {
    prisma_connection_test: database.prisma_test,
    embedding_limiter_schema: database.limiterSchema,
    database_url_configured: Boolean(process.env.DATABASE_URL),
    connection_latency_ms: database.latency_ms,
    canary_configured: canaryConfigured(),
    env_vars: {
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
    },
  };
}

async function getHandler(_request: NextRequest) {
  const timestamp = new Date().toISOString();
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<DatabaseHealth>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Health check timeout')), TIMEOUT_MS);
  });

  try {
    // The readiness probe is single-flight and bounded in the lib: this
    // request-level race only limits how long THIS response waits. A timeout
    // here never spawns duplicate database work.
    const database = await Promise.race([checkDatabaseReadiness(), timeout]);
    if (timeoutId) clearTimeout(timeoutId);

    const dependencies = dependenciesFor(database);
    const healthy = database.success && database.limiterSchema;
    if (healthy) {
      const payload: HealthStatus = {
        status: 'ok',
        timestamp,
        dependencies,
        diagnostics: diagnosticsFor(database),
        version: pkg.version,
      };

      await reportHealthCheckIn('alive', 'sploot-web health route ok', {
        database: dependencies.database,
        embedding_limiter: dependencies.embedding_limiter,
        share_slug_cache: dependencies.share_slug_cache,
        connection_latency_ms: database.latency_ms,
      });

      return json(payload, 200);
    }

    const errors: string[] = [];
    if (!database.success) {
      errors.push(`Database connection failed: ${database.error}`);
    } else if (!database.limiterSchema) {
      errors.push('Embedding limiter schema unavailable');
    }

    const payload: HealthStatus = {
      status: 'error',
      timestamp,
      dependencies,
      error: errors.join(', '),
      diagnostics: diagnosticsFor(database),
    };

    await reportHealthCheckIn('error', 'sploot-web health route degraded', {
      ...dependencies,
      error: payload.error,
    });
    return json(payload, 503);
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const payload: HealthStatus = {
      status: 'error',
      timestamp,
      dependencies: {
        database: 'down',
        embedding_limiter: 'down',
        share_slug_cache: 'local',
      },
      error: message,
      diagnostics: {
        database_url_configured: Boolean(process.env.DATABASE_URL),
        canary_configured: canaryConfigured(),
        env_vars: {
          DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
        },
      },
    };

    await reportHealthCheckIn('error', 'sploot-web health route failed', {
      error: message,
    });
    return json(payload, 503);
  }
}

function json(payload: HealthStatus, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}

async function headHandler(request: NextRequest) {
  const response = await getHandler(request);
  return new NextResponse(null, {
    status: response.status,
    headers: {
      'Cache-Control': response.headers.get('Cache-Control') ?? 'no-cache, no-store, must-revalidate',
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  });
}

async function reportHealthCheckIn(
  status: 'alive' | 'error',
  summary: string,
  context: Record<string, unknown>
) {
  await reportCanaryCheckIn({
    status,
    summary,
    ttlMs: 300_000,
    context: { route: '/api/health', ...context },
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
