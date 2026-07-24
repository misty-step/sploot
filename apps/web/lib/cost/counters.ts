import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/observability-logger';

/**
 * Durable per-account daily/monthly attempt counters backing the cost
 * kernel's inference capabilities (embedding_index, embedding_query).
 * Generalizes the pg_advisory_xact_lock + expiring-bucket idiom
 * embedding-rate-limit.ts already uses for the (global-only) embedding
 * attempt ceiling, keyed here per (capability, account, window) so index
 * and query spend are counted -- and can be budgeted -- separately. Not a
 * dollar ledger: attempt counts only, matching ADR-010.
 */

const LOCK_NAMESPACE = 'sploot:cost-admission:v1';
const DAILY_TTL_SECONDS = 26 * 60 * 60;
const MONTHLY_TTL_SECONDS = 32 * 24 * 60 * 60;

function getUtcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function getUtcMonthKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7);
}

function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const nextDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextDayMs - nowMs) / 1000));
}

function secondsUntilNextUtcMonth(nowMs: number): number {
  const now = new Date(nowMs);
  const nextMonthMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextMonthMs - nowMs) / 1000));
}

async function withLock<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!prisma) {
    throw new Error('cost-admission-counters: Postgres is unavailable');
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${LOCK_NAMESPACE})) IS NULL AS locked`;
      return work(tx);
    },
    { maxWait: 5_000, timeout: 10_000 }
  );
}

async function pruneExpired(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  await tx.costAdmissionCounter.deleteMany({ where: { expiresAt: { lte: now } } });
}

async function peekBucket(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.costAdmissionCounter.findUnique({ where: { key } });
  return row?.count ?? 0;
}

async function incrementBucket(tx: Prisma.TransactionClient, key: string, expiresAt: Date): Promise<number> {
  const row = await tx.costAdmissionCounter.upsert({
    where: { key },
    create: { key, count: 1, expiresAt },
    update: { count: { increment: 1 }, expiresAt },
    select: { count: true },
  });
  return row.count;
}

async function decrementBucket(tx: Prisma.TransactionClient, key: string): Promise<void> {
  // A bucket may already have expired and been pruned by another admission
  // transaction, in which case its capacity is already free -- refund
  // whatever bucket survives without failing the whole refund over one
  // already-recovered counter (mirrors embedding-rate-limit.ts's
  // decrementReservedBucket).
  await tx.costAdmissionCounter.updateMany({
    where: { key, count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
}

export interface InferenceBudgetKeys {
  dailyKey: string;
  monthlyKey: string;
}

export interface InferenceBudgetAdmission {
  allowed: boolean;
  reason?: 'user_daily_budget' | 'user_monthly_budget' | 'limiter_unavailable';
  retryAfterSec?: number;
  dailyCount: number;
  dailyLimit: number;
  monthlyCount: number;
  monthlyLimit: number;
  warn: boolean;
  keys: InferenceBudgetKeys;
}

export async function acquireInferenceBudget(
  capability: 'embedding_index' | 'embedding_query',
  userId: string,
  dailyLimit: number,
  monthlyLimit: number,
  warnThreshold: number,
  nowMs: number = Date.now()
): Promise<InferenceBudgetAdmission> {
  const now = new Date(nowMs);
  const dailyKey = `cost:${capability}:acct:${userId}:daily:${getUtcDateKey(nowMs)}`;
  const monthlyKey = `cost:${capability}:acct:${userId}:monthly:${getUtcMonthKey(nowMs)}`;
  const keys: InferenceBudgetKeys = { dailyKey, monthlyKey };

  try {
    return await withLock(async (tx) => {
      await pruneExpired(tx, now);
      const dailyCount = await peekBucket(tx, dailyKey);
      const monthlyCount = await peekBucket(tx, monthlyKey);

      if (dailyCount >= dailyLimit) {
        return {
          allowed: false,
          reason: 'user_daily_budget',
          retryAfterSec: secondsUntilNextUtcDay(nowMs),
          dailyCount,
          dailyLimit,
          monthlyCount,
          monthlyLimit,
          warn: false,
          keys,
        };
      }
      if (monthlyCount >= monthlyLimit) {
        return {
          allowed: false,
          reason: 'user_monthly_budget',
          retryAfterSec: secondsUntilNextUtcMonth(nowMs),
          dailyCount,
          dailyLimit,
          monthlyCount,
          monthlyLimit,
          warn: false,
          keys,
        };
      }

      const persistedDaily = await incrementBucket(tx, dailyKey, new Date(nowMs + DAILY_TTL_SECONDS * 1000));
      const persistedMonthly = await incrementBucket(tx, monthlyKey, new Date(nowMs + MONTHLY_TTL_SECONDS * 1000));
      const warn = persistedDaily >= dailyLimit * warnThreshold || persistedMonthly >= monthlyLimit * warnThreshold;

      return {
        allowed: true,
        dailyCount: persistedDaily,
        dailyLimit,
        monthlyCount: persistedMonthly,
        monthlyLimit,
        warn,
        keys,
      };
    });
  } catch {
    return {
      allowed: false,
      reason: 'limiter_unavailable',
      retryAfterSec: 30,
      dailyCount: 0,
      dailyLimit,
      monthlyCount: 0,
      monthlyLimit,
      warn: false,
      keys,
    };
  }
}

export async function refundInferenceBudget(keys: InferenceBudgetKeys): Promise<void> {
  try {
    await withLock(async (tx) => {
      await decrementBucket(tx, keys.dailyKey);
      await decrementBucket(tx, keys.monthlyKey);
    });
  } catch (error) {
    // Best-effort refund. A failure here just means the bucket over-counts
    // until its TTL expires -- the same fate an ordinary process crash
    // between admit and refund would already produce.
    logger.logError('cost-admission.refund-failed', error, keys);
  }
}
