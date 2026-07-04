import { kv } from '@vercel/kv';
import { logger } from '@/lib/observability-logger';

export const EMBEDDING_RATE_WINDOW_SECONDS = 60;
export const EMBEDDING_USER_WINDOW_LIMIT = 5;
export const EMBEDDING_GLOBAL_WINDOW_LIMIT = 50;
export const EMBEDDING_USER_CONCURRENCY_LIMIT = 1;
export const EMBEDDING_GLOBAL_CONCURRENCY_LIMIT = 3;
export const EMBEDDING_INFLIGHT_TTL_SECONDS = 180;

// Daily ceiling on embedding *generation attempts*, independent of the
// per-minute burst/concurrency limits above. Bounds worst-case daily
// Replicate spend against a bulk-import or retry-loop spike, the same way
// docs/adr/008-cap-image-optimization-cost.md caps CDN spend with a named,
// testable constant instead of an unbounded surface. Replicate embedding
// calls run well under $0.01 each; 2,000/day keeps worst-case daily spend
// in the single digits regardless of upload volume.
export const EMBEDDING_DAILY_BUDGET = 2000;
export const EMBEDDING_DAILY_BUDGET_TTL_SECONDS = 26 * 60 * 60; // covers UTC-day rollover drift

export type EmbeddingRateLimitReason =
  | 'user_rate'
  | 'global_rate'
  | 'user_concurrency'
  | 'global_concurrency'
  | 'kv_unavailable';

export type EmbeddingDailyBudgetReason = 'daily_budget' | 'kv_unavailable';

export interface EmbeddingDailyBudgetResult {
  allowed: boolean;
  reason?: EmbeddingDailyBudgetReason;
  count: number;
  limit: number;
  retryAfterSec?: number;
}

export interface EmbeddingRateLimitLease {
  userId: string;
  inflightUserKey: string;
  inflightGlobalKey: string;
}

export interface EmbeddingRateLimitResult {
  allowed: boolean;
  reason?: EmbeddingRateLimitReason;
  retryAfterSec?: number;
  lease?: EmbeddingRateLimitLease;
  counts?: {
    userWindow: number;
    globalWindow: number;
    userInflight: number;
    globalInflight: number;
  };
}

function getWindowId(nowMs: number): number {
  return Math.floor(nowMs / (EMBEDDING_RATE_WINDOW_SECONDS * 1000));
}

function getWindowRetryAfterSec(nowMs: number): number {
  const elapsed = Math.floor((nowMs / 1000) % EMBEDDING_RATE_WINDOW_SECONDS);
  return Math.max(1, EMBEDDING_RATE_WINDOW_SECONDS - elapsed);
}

async function incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
  const value = await kv.incr(key);
  if (value === 1) {
    await kv.expire(key, ttlSeconds);
  }
  return value;
}

async function decrementSafe(key: string): Promise<void> {
  try {
    await kv.decr(key);
  } catch (error) {
    logger.logError('embedding-rate-limit.decrement-failed', error, { key });
  }
}

export async function acquireEmbeddingRateLimit(
  userId: string
): Promise<EmbeddingRateLimitResult> {
  const nowMs = Date.now();
  const windowId = getWindowId(nowMs);
  const retryAfterSec = getWindowRetryAfterSec(nowMs);

  const inflightUserKey = `embedding:inflight:user:${userId}`;
  const inflightGlobalKey = 'embedding:inflight:global';

  const userWindowKey = `embedding:rate:user:${userId}:${windowId}`;
  const globalWindowKey = `embedding:rate:global:${windowId}`;
  let userInflightIncremented = false;
  let globalInflightIncremented = false;
  let userWindowIncremented = false;
  let globalWindowIncremented = false;

  try {
    const userInflight = await incrementWithExpiry(
      inflightUserKey,
      EMBEDDING_INFLIGHT_TTL_SECONDS
    );
    userInflightIncremented = true;
    const globalInflight = await incrementWithExpiry(
      inflightGlobalKey,
      EMBEDDING_INFLIGHT_TTL_SECONDS
    );
    globalInflightIncremented = true;

    if (userInflight > EMBEDDING_USER_CONCURRENCY_LIMIT) {
      await Promise.all([
        decrementSafe(inflightUserKey),
        decrementSafe(inflightGlobalKey),
      ]);
      return {
        allowed: false,
        reason: 'user_concurrency',
        retryAfterSec: EMBEDDING_INFLIGHT_TTL_SECONDS,
        counts: { userInflight, globalInflight, userWindow: 0, globalWindow: 0 },
      };
    }

    if (globalInflight > EMBEDDING_GLOBAL_CONCURRENCY_LIMIT) {
      await Promise.all([
        decrementSafe(inflightUserKey),
        decrementSafe(inflightGlobalKey),
      ]);
      // Global (not per-user) pressure means the queue depth floor was
      // crossed system-wide, not one user hitting their own throttle —
      // that is worth an operator's attention.
      logger.logError(
        'embedding-rate-limit.global-concurrency-breach',
        new Error('Embedding global concurrency limit exceeded'),
        { globalInflight, limit: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT }
      );
      return {
        allowed: false,
        reason: 'global_concurrency',
        retryAfterSec: EMBEDDING_INFLIGHT_TTL_SECONDS,
        counts: { userInflight, globalInflight, userWindow: 0, globalWindow: 0 },
      };
    }

    const userWindow = await incrementWithExpiry(
      userWindowKey,
      EMBEDDING_RATE_WINDOW_SECONDS + 2
    );
    userWindowIncremented = true;
    const globalWindow = await incrementWithExpiry(
      globalWindowKey,
      EMBEDDING_RATE_WINDOW_SECONDS + 2
    );
    globalWindowIncremented = true;

    if (userWindow > EMBEDDING_USER_WINDOW_LIMIT) {
      await Promise.all([
        decrementSafe(userWindowKey),
        decrementSafe(globalWindowKey),
        decrementSafe(inflightUserKey),
        decrementSafe(inflightGlobalKey),
      ]);
      return {
        allowed: false,
        reason: 'user_rate',
        retryAfterSec,
        counts: { userWindow, globalWindow, userInflight, globalInflight },
      };
    }

    if (globalWindow > EMBEDDING_GLOBAL_WINDOW_LIMIT) {
      await Promise.all([
        decrementSafe(userWindowKey),
        decrementSafe(globalWindowKey),
        decrementSafe(inflightUserKey),
        decrementSafe(inflightGlobalKey),
      ]);
      logger.logError(
        'embedding-rate-limit.global-rate-breach',
        new Error('Embedding global rate limit exceeded'),
        { globalWindow, limit: EMBEDDING_GLOBAL_WINDOW_LIMIT }
      );
      return {
        allowed: false,
        reason: 'global_rate',
        retryAfterSec,
        counts: { userWindow, globalWindow, userInflight, globalInflight },
      };
    }

    return {
      allowed: true,
      lease: {
        userId,
        inflightUserKey,
        inflightGlobalKey,
      },
      counts: { userWindow, globalWindow, userInflight, globalInflight },
    };
  } catch (error) {
    const rollbacks: Promise<void>[] = [];
    if (userInflightIncremented) {
      rollbacks.push(decrementSafe(inflightUserKey));
    }
    if (globalInflightIncremented) {
      rollbacks.push(decrementSafe(inflightGlobalKey));
    }
    if (userWindowIncremented) {
      rollbacks.push(decrementSafe(userWindowKey));
    }
    if (globalWindowIncremented) {
      rollbacks.push(decrementSafe(globalWindowKey));
    }
    if (rollbacks.length > 0) {
      await Promise.all(rollbacks);
    }
    logger.logError('embedding-rate-limit.kv-unavailable', error, { userId });
    return {
      allowed: false,
      reason: 'kv_unavailable',
      retryAfterSec: 30,
    };
  }
}

export async function releaseEmbeddingRateLimit(
  lease: EmbeddingRateLimitLease | undefined | null
): Promise<void> {
  if (!lease) return;

  await Promise.all([
    decrementSafe(lease.inflightUserKey),
    decrementSafe(lease.inflightGlobalKey),
  ]);
}

function getUtcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.round((nextDayMs - nowMs) / 1000));
}

/**
 * Global daily ceiling on embedding generation attempts. Independent of
 * (and checked in addition to) the per-minute rate/concurrency limits
 * above — those bound bursts, this bounds total daily Replicate spend.
 *
 * Fails closed on KV outage, matching acquireEmbeddingRateLimit: an
 * unreachable limiter must not become an unbounded spend surface.
 */
export async function acquireEmbeddingDailyBudget(
  nowMs: number = Date.now()
): Promise<EmbeddingDailyBudgetResult> {
  const dateKey = getUtcDateKey(nowMs);
  const dailyKey = `embedding:daily:${dateKey}`;

  try {
    const count = await incrementWithExpiry(dailyKey, EMBEDDING_DAILY_BUDGET_TTL_SECONDS);

    if (count > EMBEDDING_DAILY_BUDGET) {
      await decrementSafe(dailyKey);
      logger.logError(
        'embedding-rate-limit.daily-budget-breach',
        new Error('Embedding daily budget exceeded'),
        { dateKey, count: count - 1, limit: EMBEDDING_DAILY_BUDGET }
      );
      return {
        allowed: false,
        reason: 'daily_budget',
        count: count - 1,
        limit: EMBEDDING_DAILY_BUDGET,
        retryAfterSec: secondsUntilNextUtcDay(nowMs),
      };
    }

    return { allowed: true, count, limit: EMBEDDING_DAILY_BUDGET };
  } catch (error) {
    logger.logError('embedding-rate-limit.daily-budget-kv-unavailable', error, { dateKey });
    return {
      allowed: false,
      reason: 'kv_unavailable',
      count: 0,
      limit: EMBEDDING_DAILY_BUDGET,
      retryAfterSec: 30,
    };
  }
}
