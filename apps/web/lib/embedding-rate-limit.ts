import { kv } from '@vercel/kv';
import { logger } from '@/lib/observability-logger';

export const EMBEDDING_RATE_WINDOW_SECONDS = 60;
export const EMBEDDING_USER_WINDOW_LIMIT = 5;
export const EMBEDDING_GLOBAL_WINDOW_LIMIT = 50;
export const EMBEDDING_USER_CONCURRENCY_LIMIT = 1;
export const EMBEDDING_GLOBAL_CONCURRENCY_LIMIT = 3;
export const EMBEDDING_INFLIGHT_TTL_SECONDS = 180;

export type EmbeddingRateLimitReason =
  | 'user_rate'
  | 'global_rate'
  | 'user_concurrency'
  | 'global_concurrency'
  | 'kv_unavailable';

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
