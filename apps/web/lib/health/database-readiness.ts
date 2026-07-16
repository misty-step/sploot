import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';
import economicsPolicy from '../../../../economics/policy.json';

/**
 * Deep database readiness probe for /api/health.
 *
 * Ownership boundary (incident 2026-07-15): deep health raced an uncancelled
 * Prisma query per request and globally disconnected/reconnected the shared
 * client on stale errors. Under a slow-database workload every platform probe
 * added load, health 503'd, and DigitalOcean (then routing on this endpoint)
 * removed the only web instance -> no_healthy_upstream. Platform routing now
 * targets /api/health/live; this module keeps the deep oracle fail-closed
 * while guaranteeing:
 *
 * - at most one underlying database probe per process under concurrent calls
 *   (single-flight): a request timeout never launches duplicate work;
 * - a timed-out probe stays single until it settles; when it settles the slot
 *   is released so recovery is observed by the next request;
 * - a never-settling probe is bounded by PROBE_DEADLINE_MS for each caller,
 *   while its single-flight slot remains fenced until the underlying query settles;
 * - stale-connection errors retry the query once on the pooled client and
 *   never invoke global $disconnect/$connect while requests are in flight.
 */

export interface DatabaseHealth {
  success: boolean;
  limiterSchema: boolean;
  error?: string;
  latency_ms?: number;
  prisma_test: boolean;
}

interface LimiterSchemaRow {
  limiter_buckets: string | null;
  limiter_leases: string | null;
  provider_circuits: string | null;
  circuit_generation: string | null;
  circuit_probe_until: string | null;
  circuit_probe_generation: string | null;
  circuit_probe_lease_token: string | null;
  attempt_count: string | null;
  next_attempt_at: string | null;
  terminal_at: string | null;
  processing_claim_token: string | null;
  revive_count: string | null;
  attempt_ceiling_constraint: boolean;
  claim_token_constraint: boolean;
  revive_constraint: boolean;
  revival_trigger: boolean;
  pending_index: string | null;
  circuit_index: string | null;
  bootstrap_phase: string | null;
  bootstrap_version: string | null;
  bootstrap_schema_version: string | null;
}

interface BootstrapMarkerRow {
  bootstrap_phase: string | null;
  bootstrap_version: string | null;
  bootstrap_schema_version: string | null;
}

/** Upper bound on one underlying probe's lifetime, independent of requests. */
export const PROBE_DEADLINE_MS = 10_000;

function stripeBootstrapRequired(): boolean {
  const configured = process.env.STRIPE_LEDGER_BOOTSTRAP_REQUIRED;
  if (configured === undefined || configured === '' || configured === 'false') return false;
  if (configured === 'true') return true;
  throw new Error('STRIPE_LEDGER_BOOTSTRAP_REQUIRED must be true or false');
}

async function queryRuntimeSchema(): Promise<LimiterSchemaRow[]> {
  return prisma.$queryRaw<LimiterSchemaRow[]>`
    SELECT
      to_regclass('public.embedding_rate_buckets')::text AS limiter_buckets,
      to_regclass('public.embedding_rate_leases')::text AS limiter_leases,
      to_regclass('public.embedding_provider_circuits')::text AS provider_circuits,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
          AND column_name = 'generation'
      ) AS circuit_generation,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
          AND column_name = 'probe_until'
      ) AS circuit_probe_until,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
          AND column_name = 'probe_generation'
      ) AS circuit_probe_generation,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
          AND column_name = 'probe_lease_token'
      ) AS circuit_probe_lease_token,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
          AND column_name = 'attempt_count'
      ) AS attempt_count,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
          AND column_name = 'next_attempt_at'
      ) AS next_attempt_at,
      (
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
          AND column_name = 'terminal_at'
      ) AS terminal_at,
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
        WHERE c.conname = 'embedding_attempt_count_ceiling'
          AND t.relname = 'embedding_rate_buckets' AND n.nspname = 'public'
          AND c.convalidated
          AND pg_get_constraintdef(c.oid) LIKE ${`%count <= ${economicsPolicy.global.replicateDailyAttempts}%`}
          AND pg_get_constraintdef(c.oid) LIKE ${`%count <= ${economicsPolicy.global.replicateMonthlyAttempts}%`}
      ) AS attempt_ceiling_constraint,
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
      ,to_regclass('public.asset_embeddings_pending_next_attempt_idx')::text AS pending_index
      ,to_regclass('public.embedding_provider_circuits_open_until_idx')::text AS circuit_index
      ,NULL::text AS bootstrap_phase
      ,NULL::text AS bootstrap_version
      ,NULL::text AS bootstrap_schema_version
  `;
}

async function queryBootstrapMarker(): Promise<BootstrapMarkerRow[]> {
  return prisma.$queryRaw<BootstrapMarkerRow[]>`
    SELECT
      marker.phase AS bootstrap_phase,
      marker.version AS bootstrap_version,
      (
        SELECT rpad(split_part(migration_name, '_', 1), 14, '0')
        FROM public._prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name DESC
        LIMIT 1
      ) AS bootstrap_schema_version
    FROM sploot_bootstrap.stripe_ledger_bootstrap_state marker
    WHERE marker.id = TRUE
  `;
}

async function queryRequiredRuntimeSchema(bootstrapRequired: boolean): Promise<LimiterSchemaRow[]> {
  const rows = await queryRuntimeSchema();
  if (bootstrapRequired) {
    const [marker] = await queryBootstrapMarker();
    if (rows[0] && marker) Object.assign(rows[0], marker);
  }
  return rows;
}

function schemaIsReady(rows: LimiterSchemaRow[], bootstrapRequired: boolean): boolean {
  const row = rows[0];
  const bootstrapReady = !bootstrapRequired || Boolean(
    row?.bootstrap_phase === 'ready' &&
    row.bootstrap_version &&
    row.bootstrap_version === row.bootstrap_schema_version,
  );
  return Boolean(
    row?.limiter_buckets &&
    row.limiter_leases &&
    row.provider_circuits &&
    row.circuit_generation &&
    row.circuit_probe_until &&
    row.circuit_probe_generation &&
    row.circuit_probe_lease_token &&
    row.attempt_count &&
    row.next_attempt_at &&
    row.terminal_at &&
    row.processing_claim_token &&
    row.revive_count &&
    row.attempt_ceiling_constraint &&
    row.claim_token_constraint &&
    row.revive_constraint &&
    row.revival_trigger &&
    row.pending_index &&
    row.circuit_index &&
    bootstrapReady,
  );
}

function isStaleConnectionError(error: Error): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.message.includes('Server has closed the connection') ||
      error.message.includes('Connection terminated unexpectedly') ||
      error.message.includes('connection has been closed') ||
      error.code === 'P1002' ||
      error.code === 'P1008')
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
    const bootstrapRequired = stripeBootstrapRequired();
    const rows = await queryRequiredRuntimeSchema(bootstrapRequired);
    return {
      success: true,
      limiterSchema: schemaIsReady(rows, bootstrapRequired),
      latency_ms: Date.now() - startedAt,
      prisma_test: true,
    };
  } catch (error) {
    const databaseError = error as Error;
    if (!isStaleConnectionError(databaseError)) {
      logger.logError('health-check-database-failed', databaseError);
      return {
        success: false,
        limiterSchema: false,
        error: databaseError.message,
        latency_ms: Date.now() - startedAt,
        prisma_test: false,
      };
    }

    // A stale pooled connection is retried once as a plain query. The shared
    // Prisma client is deliberately never globally disconnected/reconnected
    // here: live requests are using its pool.
    logger.logInfo('health-check-db-stale-retry', {
      reason: 'stale_connection',
      error: databaseError.message,
      errorCode: (databaseError as Prisma.PrismaClientKnownRequestError).code,
    });

    try {
      const bootstrapRequired = stripeBootstrapRequired();
      const rows = await queryRequiredRuntimeSchema(bootstrapRequired);
      const latencyMs = Date.now() - startedAt;
      logger.logInfo('health-check-db-retry-success', { latency_ms: latencyMs });
      return {
        success: true,
        limiterSchema: schemaIsReady(rows, bootstrapRequired),
        latency_ms: latencyMs,
        prisma_test: true,
      };
    } catch (retryError) {
      const retry = retryError as Error;
      logger.logError('health-check-db-retry-failed', retry);
      return {
        success: false,
        limiterSchema: false,
        error: `Retry failed: ${retry.message}`,
        latency_ms: Date.now() - startedAt,
        prisma_test: false,
      };
    }
  }
}

let inflightProbe: Promise<DatabaseHealth> | null = null;

interface BoundedProbe {
  result: Promise<DatabaseHealth>;
  underlying: Promise<DatabaseHealth>;
}

function boundedProbe(): BoundedProbe {
  const underlying = checkDatabase();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const deadlineFailure = new Promise<DatabaseHealth>((resolve) => {
    deadline = setTimeout(() => {
      logger.logError(
        'health-check-db-probe-deadline',
        new Error(`database probe exceeded ${PROBE_DEADLINE_MS}ms and was abandoned`),
      );
      resolve({
        success: false,
        limiterSchema: false,
        error: `Database probe exceeded ${PROBE_DEADLINE_MS}ms`,
        latency_ms: PROBE_DEADLINE_MS,
        prisma_test: false,
      });
    }, PROBE_DEADLINE_MS);
    if (typeof deadline === 'object' && 'unref' in deadline) deadline.unref();
  });

  const result = Promise.race([underlying, deadlineFailure]);
  result.then(
    () => { if (deadline !== undefined) clearTimeout(deadline); },
    () => { if (deadline !== undefined) clearTimeout(deadline); },
  );
  return { result, underlying };
}

/**
 * Single-flight deep database readiness. Concurrent callers share one
 * underlying probe; the slot is released only when that underlying probe
 * settles. A probe deadline bounds each returned result but cannot release
 * the slot while Prisma is still running, preventing duplicate queries.
 */
export function checkDatabaseReadiness(): Promise<DatabaseHealth> {
  if (inflightProbe) return inflightProbe;
  const bounded = boundedProbe();
  const probe = bounded.result;
  inflightProbe = probe;
  const release = () => {
    if (inflightProbe === probe) inflightProbe = null;
  };
  bounded.underlying.then(release, release);
  return probe;
}

/** Test seam: module-level single-flight state must not leak across tests. */
export function __resetDatabaseReadinessForTests(): void {
  inflightProbe = null;
}
