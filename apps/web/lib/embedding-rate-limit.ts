import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';
import { acquireEnrollmentIdentityWriterLock, EnrollmentUnavailableError } from '@/lib/enrollment/enrollment-policy';

export const EMBEDDING_RATE_WINDOW_SECONDS = 60;
export const EMBEDDING_USER_WINDOW_LIMIT = 5;
export const EMBEDDING_GLOBAL_WINDOW_LIMIT = 50;
export const EMBEDDING_USER_CONCURRENCY_LIMIT = 1;
export const EMBEDDING_GLOBAL_CONCURRENCY_LIMIT = 3;
export const EMBEDDING_INFLIGHT_TTL_SECONDS = 180;

// Global ceiling on paid embedding generation attempts per UTC day.
export const EMBEDDING_DAILY_BUDGET = 2000;
export const EMBEDDING_DAILY_BUDGET_TTL_SECONDS = 26 * 60 * 60;

const LIMITER_LOCK_NAMESPACE = 'sploot:embedding-rate-limit:v1';
const GLOBAL_WINDOW_KEY_PREFIX = 'embedding:rate:global';

export type EmbeddingRateLimitReason =
  | 'user_rate'
  | 'global_rate'
  | 'user_concurrency'
  | 'global_concurrency'
  | 'limiter_unavailable';

export type EmbeddingDailyBudgetReason = 'daily_budget' | 'limiter_unavailable';

export interface EmbeddingDailyBudgetResult {
  allowed: boolean;
  reason?: EmbeddingDailyBudgetReason;
  count: number;
  limit: number;
  retryAfterSec?: number;
}

export interface EmbeddingRateLimitLease {
  id: string;
  userId: string;
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

function getWindowExpiry(windowId: number): Date {
  return new Date((windowId + 1) * EMBEDDING_RATE_WINDOW_SECONDS * 1000);
}

function getUtcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.round((nextDayMs - nowMs) / 1000));
}

async function withLimiterLock<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!prisma) {
    throw new EnrollmentUnavailableError();
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${LIMITER_LOCK_NAMESPACE})) IS NULL AS locked
      `;
      return work(tx);
    },
    { maxWait: 5_000, timeout: 10_000 }
  );
}

async function pruneExpiredLimiterState(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<void> {
  await Promise.all([
    tx.embeddingRateLease.deleteMany({ where: { expiresAt: { lte: now } } }),
    tx.embeddingRateBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
}

async function incrementBucket(
  tx: Prisma.TransactionClient,
  key: string,
  expiresAt: Date
): Promise<number> {
  const bucket = await tx.embeddingRateBucket.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 }, expiresAt },
    select: { count: true },
  });
  return bucket.count;
}

export async function acquireEmbeddingRateLimit(
  userId: string,
  nowMs: number = Date.now()
): Promise<EmbeddingRateLimitResult> {
  const now = new Date(nowMs);
  const windowId = getWindowId(nowMs);
  const retryAfterSec = getWindowRetryAfterSec(nowMs);
  const userWindowKey = `embedding:rate:user:${userId}:${windowId}`;
  const globalWindowKey = `${GLOBAL_WINDOW_KEY_PREFIX}:${windowId}`;

  try {
    return await withLimiterLock(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const enrolledUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!enrolledUser) {
        throw new EnrollmentUnavailableError();
      }
      await pruneExpiredLimiterState(tx, now);

      const [userInflight, globalInflight, userBucket, globalBucket] = await Promise.all([
        tx.embeddingRateLease.count({ where: { userId, expiresAt: { gt: now } } }),
        tx.embeddingRateLease.count({ where: { expiresAt: { gt: now } } }),
        tx.embeddingRateBucket.findUnique({ where: { key: userWindowKey } }),
        tx.embeddingRateBucket.findUnique({ where: { key: globalWindowKey } }),
      ]);

      const userWindow = userBucket?.count ?? 0;
      const globalWindow = globalBucket?.count ?? 0;
      const candidateCounts = {
        userWindow: userWindow + 1,
        globalWindow: globalWindow + 1,
        userInflight: userInflight + 1,
        globalInflight: globalInflight + 1,
      };

      if (userInflight >= EMBEDDING_USER_CONCURRENCY_LIMIT) {
        return {
          allowed: false,
          reason: 'user_concurrency',
          retryAfterSec: EMBEDDING_INFLIGHT_TTL_SECONDS,
          counts: candidateCounts,
        };
      }

      if (globalInflight >= EMBEDDING_GLOBAL_CONCURRENCY_LIMIT) {
        logger.logError(
          'embedding-rate-limit.global-concurrency-breach',
          new Error('Embedding global concurrency limit exceeded'),
          { globalInflight, limit: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT }
        );
        return {
          allowed: false,
          reason: 'global_concurrency',
          retryAfterSec: EMBEDDING_INFLIGHT_TTL_SECONDS,
          counts: candidateCounts,
        };
      }

      if (userWindow >= EMBEDDING_USER_WINDOW_LIMIT) {
        return {
          allowed: false,
          reason: 'user_rate',
          retryAfterSec,
          counts: candidateCounts,
        };
      }

      if (globalWindow >= EMBEDDING_GLOBAL_WINDOW_LIMIT) {
        logger.logError(
          'embedding-rate-limit.global-rate-breach',
          new Error('Embedding global rate limit exceeded'),
          { globalWindow, limit: EMBEDDING_GLOBAL_WINDOW_LIMIT }
        );
        return {
          allowed: false,
          reason: 'global_rate',
          retryAfterSec,
          counts: candidateCounts,
        };
      }

      const expiresAt = getWindowExpiry(windowId);
      const lease = {
        id: randomUUID(),
        userId,
      };

      const [persistedUserWindow, persistedGlobalWindow] = await Promise.all([
        incrementBucket(tx, userWindowKey, expiresAt),
        incrementBucket(tx, globalWindowKey, expiresAt),
        tx.embeddingRateLease.create({
          data: {
            ...lease,
            expiresAt: new Date(nowMs + EMBEDDING_INFLIGHT_TTL_SECONDS * 1000),
          },
        }),
      ]);

      return {
        allowed: true,
        lease,
        counts: {
          userWindow: persistedUserWindow,
          globalWindow: persistedGlobalWindow,
          userInflight: candidateCounts.userInflight,
          globalInflight: candidateCounts.globalInflight,
        },
      };
    });
  } catch (error) {
    logger.logError('embedding-rate-limit.store-unavailable', error, { userId });
    return {
      allowed: false,
      reason: 'limiter_unavailable',
      retryAfterSec: 30,
    };
  }
}

export async function releaseEmbeddingRateLimit(
  lease: EmbeddingRateLimitLease | undefined | null
): Promise<void> {
  if (!lease) return;

  try {
    if (!prisma) {
      throw new Error('Postgres is not configured');
    }
    await prisma.embeddingRateLease.deleteMany({ where: { id: lease.id } });
  } catch (error) {
    logger.logError('embedding-rate-limit.release-failed', error, {
      leaseId: lease.id,
      userId: lease.userId,
    });
  }
}

export async function acquireEmbeddingDailyBudget(
  nowMs: number = Date.now()
): Promise<EmbeddingDailyBudgetResult> {
  const now = new Date(nowMs);
  const dateKey = getUtcDateKey(nowMs);
  const dailyKey = `embedding:daily:${dateKey}`;

  try {
    return await withLimiterLock(async (tx) => {
      await pruneExpiredLimiterState(tx, now);
      const bucket = await tx.embeddingRateBucket.findUnique({ where: { key: dailyKey } });
      const count = bucket?.count ?? 0;

      if (count >= EMBEDDING_DAILY_BUDGET) {
        logger.logError(
          'embedding-rate-limit.daily-budget-breach',
          new Error('Embedding daily budget exceeded'),
          { dateKey, count, limit: EMBEDDING_DAILY_BUDGET }
        );
        return {
          allowed: false,
          reason: 'daily_budget',
          count,
          limit: EMBEDDING_DAILY_BUDGET,
          retryAfterSec: secondsUntilNextUtcDay(nowMs),
        };
      }

      const persistedCount = await incrementBucket(
        tx,
        dailyKey,
        new Date(nowMs + EMBEDDING_DAILY_BUDGET_TTL_SECONDS * 1000)
      );
      return {
        allowed: true,
        count: persistedCount,
        limit: EMBEDDING_DAILY_BUDGET,
      };
    });
  } catch (error) {
    logger.logError('embedding-rate-limit.daily-budget-store-unavailable', error, { dateKey });
    return {
      allowed: false,
      reason: 'limiter_unavailable',
      count: 0,
      limit: EMBEDDING_DAILY_BUDGET,
      retryAfterSec: 30,
    };
  }
}
