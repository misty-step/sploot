import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import pkg from '@/package.json';
import { canaryConfigured, reportCanaryCheckIn } from '@/lib/canary-reporter';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';

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

interface DatabaseHealth {
  success: boolean;
  limiterSchema: boolean;
  error?: string;
  latency_ms?: number;
  prisma_test: boolean;
}

interface LimiterSchemaRow {
  limiter_buckets: string | null;
  limiter_leases: string | null;
  processing_claim_token: string | null;
  revive_count: string | null;
  claim_token_constraint: boolean;
  revive_constraint: boolean;
  revival_trigger: boolean;
}

const TIMEOUT_MS = 5_000;

async function queryRuntimeSchema(): Promise<LimiterSchemaRow[]> {
  return prisma.$queryRaw<LimiterSchemaRow[]>`
    SELECT
      to_regclass('public.embedding_rate_buckets')::text AS limiter_buckets,
      to_regclass('public.embedding_rate_leases')::text AS limiter_leases,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
          AND column_name = 'processing_claim_token'
      ) AS processing_claim_token,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
          AND column_name = 'revive_count'
      ) AS revive_count,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'asset_embeddings_processing_claim_token_state'
          AND t.relname = 'asset_embeddings' AND n.nspname = 'public'
          AND c.convalidated
      ) AS claim_token_constraint,
      EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'asset_embeddings_revive_count_bounded'
          AND t.relname = 'asset_embeddings' AND n.nspname = 'public'
          AND c.convalidated
      ) AS revive_constraint,
      EXISTS (
        SELECT 1 FROM pg_trigger tr
        JOIN pg_class t ON t.oid = tr.tgrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE tr.tgname = 'asset_embeddings_revival_budget'
          AND t.relname = 'asset_embeddings' AND n.nspname = 'public'
          AND NOT tr.tgisinternal
      ) AS revival_trigger
  `;
}

function schemaIsReady(rows: LimiterSchemaRow[]): boolean {
  const row = rows[0];
  return Boolean(
    row?.limiter_buckets &&
    row.limiter_leases &&
    row.processing_claim_token &&
    row.revive_count &&
    row.claim_token_constraint &&
    row.revive_constraint &&
    row.revival_trigger,
  );
}

async function checkDatabase(): Promise<DatabaseHealth> {
  const startedAt = Date.now();

  if (!prisma) {
    return {
      success: false,
      limiterSchema: false,
      error: 'Prisma client not initialized',
      prisma_test: false,
    };
  }

  try {
    const rows = await queryRuntimeSchema();
    return {
      success: true,
      limiterSchema: schemaIsReady(rows),
      latency_ms: Date.now() - startedAt,
      prisma_test: true,
    };
  } catch (error) {
    const databaseError = error as Error;
    const isStaleConnection =
      databaseError instanceof Prisma.PrismaClientKnownRequestError &&
      (databaseError.message.includes('Server has closed the connection') ||
        databaseError.message.includes('Connection terminated unexpectedly') ||
        databaseError.message.includes('connection has been closed') ||
        databaseError.code === 'P1002' ||
        databaseError.code === 'P1008');

    if (!isStaleConnection) {
      logger.logError('health-check-database-failed', databaseError);
      return {
        success: false,
        limiterSchema: false,
        error: databaseError.message,
        latency_ms: Date.now() - startedAt,
        prisma_test: false,
      };
    }

    logger.logInfo('health-check-db-reconnecting', {
      reason: 'stale_connection',
      error: databaseError.message,
      errorCode: databaseError.code,
    });

    try {
      await prisma.$disconnect();
      await prisma.$connect();
      const rows = await queryRuntimeSchema();
      const latencyMs = Date.now() - startedAt;
      logger.logInfo('health-check-db-reconnect-success', { latency_ms: latencyMs });
      return {
        success: true,
        limiterSchema: schemaIsReady(rows),
        latency_ms: latencyMs,
        prisma_test: true,
      };
    } catch (reconnectError) {
      const reconnect = reconnectError as Error;
      logger.logError('health-check-db-reconnect-failed', reconnect);
      return {
        success: false,
        limiterSchema: false,
        error: `Reconnect failed: ${reconnect.message}`,
        latency_ms: Date.now() - startedAt,
        prisma_test: false,
      };
    }
  }
}

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
    const database = await Promise.race([checkDatabase(), timeout]);
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
