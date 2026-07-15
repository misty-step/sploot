import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';
import {
  EmbeddingAdmissionError,
  type EmbeddingAdmissionReason,
} from './embedding-admission';

export { EmbeddingAdmissionError } from './embedding-admission';
export type { EmbeddingAdmissionReason } from './embedding-admission';

export const EMBEDDING_MAX_ATTEMPTS = 3;
export const EMBEDDING_RETRY_BASE_DELAY_SECONDS = 60;
export const EMBEDDING_RETRY_MAX_DELAY_SECONDS = 60 * 60;
// Minimum age of `terminal_at` before an owner-initiated revive may re-arm
// the attempt budget. Long enough that a poisoned asset cannot re-enter a
// paid retry loop faster than four cycles per hour, short enough that assets
// stranded by an extended provider outage are recoverable the moment the
// owner retries after it ends.
export const EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS = 15 * 60;
export const EMBEDDING_PROVIDER_CIRCUIT_KEY = 'replicate-image';
export const EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS = 30;
export const EMBEDDING_PROVIDER_PROBE_LEASE_SECONDS = 60;

const EMBEDDING_ADMISSION_REASONS = new Set<EmbeddingAdmissionReason>([
  'user_rate',
  'global_rate',
  'user_concurrency',
  'global_concurrency',
  'daily_budget',
  'limiter_unavailable',
]);

const CIRCUIT_LOCK_NAMESPACE = 'sploot:embedding-provider-circuit:v2';
type EmbeddingCircuitFailureReason =
  | EmbeddingAdmissionReason
  | 'provider_rate_limit'
  | 'provider_unavailable';

export interface EmbeddingProviderCircuitLease {
  generation: number;
  probeGeneration: number | null;
  probeLeaseToken: string | null;
}

export interface EmbeddingProviderCircuitState {
  available: boolean;
  open: boolean;
  retryAfterSec?: number;
  reason?: string | null;
  generation?: number;
}

export interface EmbeddingProviderAdmission {
  allowed: boolean;
  lease?: EmbeddingProviderCircuitLease;
  retryAfterSec?: number;
  reason?: 'provider_rate_limit' | 'limiter_unavailable';
}

export interface EmbeddingAttemptFailure {
  attemptCount: number;
  terminal: boolean;
  nextAttemptAt: Date | null;
  terminalAt?: Date | null;
}

function retryAfterSeconds(openUntil: Date | null, nowMs: number): number | undefined {
  if (!openUntil || openUntil.getTime() <= nowMs) return undefined;
  return Math.max(1, Math.ceil((openUntil.getTime() - nowMs) / 1000));
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextDayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((nextDayMs - nowMs) / 1000));
}

export function admissionBackoffSeconds(
  reason: EmbeddingAdmissionReason | EmbeddingCircuitFailureReason | 'provider_circuit_open',
  retryAfterSec: number | undefined,
  nowMs: number
): number {
  if (reason === 'daily_budget') {
    return Math.max(
      EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
      retryAfterSec ?? secondsUntilNextUtcDay(nowMs)
    );
  }

  return Math.min(
    EMBEDDING_RETRY_MAX_DELAY_SECONDS,
    Math.max(EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS, retryAfterSec ?? 0)
  );
}

/**
 * Global admission scope: reasons that affect every user, used by cron to
 * stop the current batch (further items in the same batch would be denied for
 * the same reason). This is deliberately broader than the circuit policy.
 */
export function isGlobalEmbeddingAdmissionReason(reason: string): boolean {
  return (
    reason === 'global_rate' ||
    reason === 'global_concurrency' ||
    reason === 'daily_budget' ||
    reason === 'limiter_unavailable'
  );
}

/**
 * Circuit policy: only denials that stay true for their whole window may open
 * the shared provider circuit. `global_concurrency` is excluded on purpose —
 * it means the fixed pool of in-flight leases is busy doing healthy work, and
 * those leases self-release within seconds (EMBEDDING_INFLIGHT_TTL_SECONDS at
 * worst, for a crashed worker). Opening a durable interval for it would turn
 * ordinary throughput saturation into a repeated ~3-minute global outage.
 * Window/budget/limiter exhaustion cannot be resolved by in-flight work
 * completing, so those remain circuit-opening.
 */
export function isCircuitOpeningAdmissionReason(reason: string): boolean {
  return (
    reason === 'global_rate' ||
    reason === 'daily_budget' ||
    reason === 'limiter_unavailable'
  );
}

export function getEmbeddingAdmissionReason(
  error: unknown
): EmbeddingAdmissionReason | undefined {
  if (error instanceof EmbeddingAdmissionError) return error.reason;
  return undefined;
}

function isEmbeddingAdmissionReason(
  reason: unknown
): reason is EmbeddingAdmissionReason {
  return typeof reason === 'string' && EMBEDDING_ADMISSION_REASONS.has(reason as EmbeddingAdmissionReason);
}

function isProviderFailureReason(
  reason: unknown
): reason is 'provider_rate_limit' | 'provider_unavailable' {
  return reason === 'provider_rate_limit' || reason === 'provider_unavailable';
}

async function withCircuitLock<T>(
  work: (tx: PrismaTypes.TransactionClient) => Promise<T>
): Promise<T> {
  if (!prisma) throw new Error('Postgres is not configured');

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${CIRCUIT_LOCK_NAMESPACE})) IS NULL AS locked
    `;
    return work(tx);
  }, { maxWait: 5_000, timeout: 10_000 });
}

export async function getEmbeddingProviderCircuit(
  nowMs: number = Date.now()
): Promise<EmbeddingProviderCircuitState> {
  if (!prisma) {
    return {
      available: false,
      open: true,
      retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
    };
  }

  try {
    const row = await prisma.embeddingProviderCircuit.findUnique({
      where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
      select: { openUntil: true, lastReason: true, generation: true },
    });
    return {
      available: true,
      open: retryAfterSeconds(row?.openUntil ?? null, nowMs) !== undefined,
      retryAfterSec: retryAfterSeconds(row?.openUntil ?? null, nowMs),
      reason: row?.lastReason,
      generation: row?.generation ?? 0,
    };
  } catch (error) {
    logger.logError('embedding-provider-circuit.read-failed', error);
    return {
      available: false,
      open: true,
      retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
    };
  }
}

/**
 * Admit one possible provider attempt.  When recovering from an open circuit,
 * only one generation-matched probe lease may pass; all other callers remain
 * suppressed until that lease expires or records success/failure.
 */
export async function acquireEmbeddingProviderAdmission(
  nowMs: number = Date.now()
): Promise<EmbeddingProviderAdmission> {
  if (!prisma) {
    return {
      allowed: false,
      reason: 'limiter_unavailable',
      retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
    };
  }

  try {
    return await withCircuitLock(async (tx) => {
      const now = new Date(nowMs);
      const row = await tx.embeddingProviderCircuit.findUnique({
        where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
        select: {
          generation: true,
          openUntil: true,
          probeUntil: true,
          probeGeneration: true,
          probeLeaseToken: true,
        },
      });
      const generation = row?.generation ?? 0;
      const openRetryAfterSec = retryAfterSeconds(row?.openUntil ?? null, nowMs);
      if (openRetryAfterSec !== undefined) {
        return { allowed: false, reason: 'provider_rate_limit', retryAfterSec: openRetryAfterSec };
      }

      const probeRetryAfterSec = retryAfterSeconds(row?.probeUntil ?? null, nowMs);
      if (probeRetryAfterSec !== undefined) {
        return { allowed: false, reason: 'provider_rate_limit', retryAfterSec: probeRetryAfterSec };
      }

      const recovering = !!row?.openUntil;
      const probeUntil = recovering
        ? new Date(nowMs + EMBEDDING_PROVIDER_PROBE_LEASE_SECONDS * 1000)
        : null;
      const probeLeaseToken = recovering ? randomUUID() : null;
      await tx.embeddingProviderCircuit.upsert({
        where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
        create: {
          key: EMBEDDING_PROVIDER_CIRCUIT_KEY,
          generation,
          probeUntil,
          probeGeneration: recovering ? generation : null,
          probeLeaseToken,
        },
        update: {
          probeUntil,
          probeGeneration: recovering ? generation : null,
          probeLeaseToken,
        },
      });

      return {
        allowed: true,
        lease: {
          generation,
          probeGeneration: recovering ? generation : null,
          probeLeaseToken,
        },
      };
    });
  } catch {
    return {
      allowed: false,
      reason: 'limiter_unavailable',
      retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
    };
  }
}

async function recordEmbeddingCircuitFailure(
  reason: EmbeddingCircuitFailureReason,
  retryAfterSec?: number,
  nowMs: number = Date.now()
): Promise<EmbeddingProviderCircuitState> {
  if (
    (!isEmbeddingAdmissionReason(reason) || !isCircuitOpeningAdmissionReason(reason)) &&
    !isProviderFailureReason(reason)
  ) {
    return getEmbeddingProviderCircuit(nowMs);
  }
  if (!prisma) {
    return { available: false, open: true, retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS, reason };
  }

  try {
    const state = await withCircuitLock(async (tx) => {
      const now = new Date(nowMs);
      const existing = await tx.embeddingProviderCircuit.findUnique({
        where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
        select: {
          failureCount: true,
          generation: true,
          openUntil: true,
          lastReason: true,
        },
      });
      const wasOpen = !!existing?.openUntil && existing.openUntil > now;
      if (wasOpen) {
        return {
          backoffSeconds: retryAfterSeconds(existing.openUntil, nowMs) ?? EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS,
          shouldAlert: false,
          reason: existing.lastReason ?? reason,
          alreadyOpen: true,
        };
      }
      const backoffSeconds = admissionBackoffSeconds(reason, retryAfterSec, nowMs);
      const openUntil = new Date(nowMs + backoffSeconds * 1000);

      await tx.embeddingProviderCircuit.upsert({
        where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
        create: {
          key: EMBEDDING_PROVIDER_CIRCUIT_KEY,
          failureCount: 1,
          generation: 1,
          openUntil,
          probeUntil: null,
          probeGeneration: null,
          probeLeaseToken: null,
          lastReason: reason,
          lastFailureAt: now,
          lastAlertedAt: now,
        },
        update: {
          failureCount: { increment: 1 },
          generation: { increment: 1 },
          openUntil,
          probeUntil: null,
          probeGeneration: null,
          probeLeaseToken: null,
          lastReason: reason,
          lastFailureAt: now,
          ...(wasOpen ? {} : { lastAlertedAt: now }),
        },
      });

      return { backoffSeconds, shouldAlert: true, reason, alreadyOpen: false };
    });

    if (state.shouldAlert) {
      logger.logError(
        'embedding-provider.circuit-open',
        new Error('Embedding provider admission is throttled'),
        { provider: EMBEDDING_PROVIDER_CIRCUIT_KEY, reason, retryAfterSec: state.backoffSeconds }
      );
    }

    return {
      available: true,
      open: true,
      retryAfterSec: state.backoffSeconds,
      reason: state.reason,
    };
  } catch (error) {
    logger.logError('embedding-provider-circuit.write-failed', error, { reason });
    return { available: false, open: true, retryAfterSec: EMBEDDING_PROVIDER_MIN_BACKOFF_SECONDS, reason };
  }
}

export async function recordEmbeddingAdmissionFailure(
  reason: string,
  retryAfterSec?: number,
  nowMs: number = Date.now()
): Promise<EmbeddingProviderCircuitState> {
  if (!isEmbeddingAdmissionReason(reason) || !isCircuitOpeningAdmissionReason(reason)) {
    return getEmbeddingProviderCircuit(nowMs);
  }
  return recordEmbeddingCircuitFailure(reason, retryAfterSec, nowMs);
}

export async function recordEmbeddingProviderFailure(
  lease: EmbeddingProviderCircuitLease,
  reason: 'provider_rate_limit' | 'provider_unavailable',
  retryAfterSec?: number,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!prisma) return false;

  try {
    const applied = await withCircuitLock(async (tx) => {
      const now = new Date(nowMs);
      const existing = await tx.embeddingProviderCircuit.findUnique({
        where: { key: EMBEDDING_PROVIDER_CIRCUIT_KEY },
        select: { generation: true, openUntil: true },
      });
      if (!existing || existing.generation !== lease.generation) return false;

      const backoffSeconds = admissionBackoffSeconds(reason, retryAfterSec, nowMs);
      const openUntil = new Date(nowMs + backoffSeconds * 1000);
      const token = lease.probeLeaseToken ?? null;
      const rows = await tx.$queryRaw<Array<{ key: string }>>(Prisma.sql`
        UPDATE "embedding_provider_circuits"
        SET "failure_count" = "failure_count" + 1,
            "generation" = "generation" + 1,
            "open_until" = ${openUntil},
            "probe_until" = NULL,
            "probe_generation" = NULL,
            "probe_lease_token" = NULL,
            "last_reason" = ${reason},
            "last_failure_at" = ${now},
            "last_alerted_at" = CASE
              WHEN "open_until" IS NOT NULL AND "open_until" > ${now}
                THEN "last_alerted_at"
              ELSE ${now}
            END,
            "updated_at" = ${now}
        WHERE "key" = ${EMBEDDING_PROVIDER_CIRCUIT_KEY}
          AND "generation" = ${lease.generation}
          AND "probe_generation" IS NOT DISTINCT FROM CAST(${lease.probeGeneration} AS INTEGER)
          AND "probe_lease_token" IS NOT DISTINCT FROM CAST(${token} AS TEXT)
        RETURNING "key"
      `);

      if (rows.length === 0) return false;
      return {
        backoffSeconds,
        shouldAlert: !(existing.openUntil && existing.openUntil > now),
      };
    });

    if (applied && applied.shouldAlert) {
      logger.logError(
        'embedding-provider.circuit-open',
        new Error('Embedding provider failure opened the circuit'),
        {
          provider: EMBEDDING_PROVIDER_CIRCUIT_KEY,
          reason,
          retryAfterSec: applied.backoffSeconds,
        }
      );
    }
    return Boolean(applied);
  } catch (error) {
    logger.logError(
      'embedding-provider-circuit.provider-failure-write-failed',
      error,
      { reason }
    );
    return false;
  }
}

/** Close only the generation that actually performed a provider attempt. */
export async function recordEmbeddingProviderSuccess(
  lease: EmbeddingProviderCircuitLease,
  nowMs: number = Date.now()
): Promise<boolean> {
  if (!prisma) return false;

  try {
    const probeLeaseToken = lease.probeLeaseToken ?? null;
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE "embedding_provider_circuits"
          SET "failure_count" = 0,
          "generation" = "generation" + 1,
          "open_until" = NULL,
          "probe_until" = NULL,
          "probe_generation" = NULL,
          "probe_lease_token" = NULL,
          "last_reason" = NULL,
          "updated_at" = ${new Date(nowMs)}
      WHERE "key" = ${EMBEDDING_PROVIDER_CIRCUIT_KEY}
        AND "generation" = ${lease.generation}
        AND (
          ("probe_lease_token" IS NULL AND CAST(${probeLeaseToken} AS TEXT) IS NULL AND "probe_generation" IS NULL)
          OR ("probe_lease_token" = CAST(${probeLeaseToken} AS TEXT) AND "probe_generation" = ${lease.probeGeneration ?? -1})
        )
        AND ("open_until" IS NULL OR "open_until" <= ${new Date(nowMs)})
    `);
    return updated > 0;
  } catch (error) {
    logger.logError('embedding-provider-circuit.success-failed', error);
    return false;
  }
}

/** Compatibility name retained for callers outside the deep executor. */
export async function resetEmbeddingProviderCircuit(
  lease?: EmbeddingProviderCircuitLease,
  nowMs: number = Date.now()
): Promise<boolean> {
  return lease ? recordEmbeddingProviderSuccess(lease, nowMs) : false;
}

export async function deferEmbeddingAdmission(
  assetId: string,
  errorMessage: string,
  reason: EmbeddingAdmissionReason | 'provider_circuit_open',
  retryAfterSec?: number,
  nowMs: number = Date.now()
): Promise<void> {
  if (!prisma) return;

  const now = new Date(nowMs);
  const nextAttemptAt = new Date(
    nowMs + admissionBackoffSeconds(reason, retryAfterSec, nowMs) * 1000
  );
  await prisma.$executeRaw`
    UPDATE "asset_embeddings"
    SET "status" = 'pending',
        "error" = ${errorMessage},
        "next_attempt_at" = ${nextAttemptAt},
        "terminal_at" = NULL,
        "updatedAt" = ${now}
    WHERE "asset_id" = ${assetId}
      AND "terminal_at" IS NULL
  `;
}

export async function recordEmbeddingAttemptFailure(
  assetId: string,
  errorMessage: string,
  nowMs: number = Date.now()
): Promise<EmbeddingAttemptFailure | null> {
  if (!prisma) return null;

  const now = new Date(nowMs);
  const firstRetryAt = new Date(nowMs + EMBEDDING_RETRY_BASE_DELAY_SECONDS * 1000);
  const rows = await prisma.$queryRaw<EmbeddingAttemptFailure[]>(Prisma.sql`
    UPDATE "asset_embeddings"
    SET
      "attempt_count" = "attempt_count" + 1,
      "status" = CASE
        WHEN "attempt_count" + 1 >= ${EMBEDDING_MAX_ATTEMPTS} THEN 'failed'
        ELSE 'pending'
      END,
      "error" = ${errorMessage},
      "next_attempt_at" = CASE
        WHEN "attempt_count" + 1 >= ${EMBEDDING_MAX_ATTEMPTS} THEN NULL
        ELSE ${firstRetryAt} + ("attempt_count" * ${EMBEDDING_RETRY_BASE_DELAY_SECONDS} * INTERVAL '1 second')
      END,
      "terminal_at" = CASE
        WHEN "attempt_count" + 1 >= ${EMBEDDING_MAX_ATTEMPTS} THEN ${now}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    WHERE "asset_id" = ${assetId}
      AND "terminal_at" IS NULL
    RETURNING
      "attempt_count" AS "attemptCount",
      ("terminal_at" IS NOT NULL) AS terminal,
      "next_attempt_at" AS "nextAttemptAt",
      "terminal_at" AS "terminalAt"
  `);

  return rows[0] ?? null;
}

export function isEmbeddingAdmissionFailure(error: unknown): error is EmbeddingAdmissionError {
  return error instanceof EmbeddingAdmissionError;
}

export interface EmbeddingTerminalRevive {
  revived: boolean;
  reason?: 'not_terminal' | 'quarantine' | 'store_unavailable';
  retryAfterSec?: number;
  previousAttemptCount?: number;
  terminalAt?: Date | null;
}

/**
 * The single authorized recovery path for a terminal embedding row.
 *
 * Callers must have already authorized the asset owner; cron and the
 * scheduler never call this, so terminal rows stay excluded from discovery
 * and the claim predicate. The revive is quarantined
 * (EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS since `terminal_at`), atomic
 * (guarded on the row still being terminal and vectorless), and only re-arms
 * the ordinary bounded attempt budget: the revived row still passes the full
 * circuit/rate/daily admission boundary, and re-poisons after
 * EMBEDDING_MAX_ATTEMPTS further failures.
 */
export async function reviveTerminalEmbedding(
  assetId: string,
  nowMs: number = Date.now()
): Promise<EmbeddingTerminalRevive> {
  if (!prisma) return { revived: false, reason: 'store_unavailable' };

  const now = new Date(nowMs);
  const quarantineBefore = new Date(
    nowMs - EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000
  );
  const rows = await prisma.$queryRaw<
    Array<{ previousAttemptCount: number; terminalAt: Date }>
  >(Prisma.sql`
    WITH terminal_row AS (
      SELECT "asset_id", "attempt_count", "terminal_at"
      FROM "asset_embeddings"
      WHERE "asset_id" = ${assetId}
        AND "terminal_at" IS NOT NULL
        AND "terminal_at" <= ${quarantineBefore}
        AND "image_embedding" IS NULL
        AND ("dim" IS NULL OR "dim" = 0)
      FOR UPDATE
    )
    UPDATE "asset_embeddings" AS e
    SET "attempt_count" = 0,
        "status" = 'pending',
        "error" = NULL,
        "next_attempt_at" = NULL,
        "terminal_at" = NULL,
        "updatedAt" = ${now}
    FROM terminal_row
    WHERE e."asset_id" = terminal_row."asset_id"
    RETURNING terminal_row."attempt_count" AS "previousAttemptCount",
              terminal_row."terminal_at" AS "terminalAt"
  `);

  if (rows[0]) {
    logger.logInfo('embedding.terminal-revived', {
      assetId,
      previousAttemptCount: rows[0].previousAttemptCount,
      terminalAt: rows[0].terminalAt.toISOString(),
    });
    return {
      revived: true,
      previousAttemptCount: rows[0].previousAttemptCount,
      terminalAt: rows[0].terminalAt,
    };
  }

  const existing = await prisma.assetEmbedding.findUnique({
    where: { assetId },
    select: { terminalAt: true },
  });
  if (existing?.terminalAt) {
    return {
      revived: false,
      reason: 'quarantine',
      retryAfterSec: Math.max(
        1,
        Math.ceil(
          (existing.terminalAt.getTime() +
            EMBEDDING_TERMINAL_REVIVE_QUARANTINE_SECONDS * 1000 -
            nowMs) /
            1000
        )
      ),
      terminalAt: existing.terminalAt,
    };
  }
  return { revived: false, reason: 'not_terminal' };
}
