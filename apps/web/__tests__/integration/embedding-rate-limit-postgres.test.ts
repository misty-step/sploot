import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  acquireEmbeddingDailyBudget,
  acquireEmbeddingRateLimit,
  releaseEmbeddingRateLimit,
  EMBEDDING_DAILY_BUDGET,
  EMBEDDING_GLOBAL_CONCURRENCY_LIMIT,
  EMBEDDING_GLOBAL_WINDOW_LIMIT,
  EMBEDDING_USER_WINDOW_LIMIT,
} from '@/lib/embedding-rate-limit';
import { prisma } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

async function resetLimiterState(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "embedding_rate_leases", "embedding_rate_buckets"'
  );
}

describeWithDatabase('Postgres embedding limiter', () => {
  beforeEach(resetLimiterState);

  afterAll(async () => {
    await resetLimiterState();
  });

  it('persists a releasable lease for an allowed request', async () => {
    const result = await acquireEmbeddingRateLimit('user-lease');

    expect(result.allowed).toBe(true);
    expect(result.lease).toMatchObject({ userId: 'user-lease' });
    expect(result.lease?.id).toEqual(expect.any(String));

    const beforeRelease = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "embedding_rate_leases"
      WHERE "user_id" = 'user-lease'
    `;
    expect(Number(beforeRelease[0]?.count)).toBe(1);

    await releaseEmbeddingRateLimit(result.lease);

    const afterRelease = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "embedding_rate_leases"
      WHERE "user_id" = 'user-lease'
    `;
    expect(Number(afterRelease[0]?.count)).toBe(0);
  });

  it('serializes concurrent acquisitions at the global concurrency cap', async () => {
    const nowMs = Date.now();
    const results = await Promise.all(
      Array.from({ length: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT + 5 }, (_, index) =>
        acquireEmbeddingRateLimit(`concurrent-user-${index}`, nowMs)
      )
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(
      EMBEDDING_GLOBAL_CONCURRENCY_LIMIT
    );
    expect(results.filter((result) => result.reason === 'global_concurrency')).toHaveLength(5);
  });

  it('recovers capacity from an expired lease after a crashed worker', async () => {
    const first = await acquireEmbeddingRateLimit('crashed-user');
    expect(first.allowed).toBe(true);

    await prisma.$executeRaw`
      UPDATE "embedding_rate_leases"
      SET "expires_at" = NOW() - INTERVAL '1 second'
      WHERE "user_id" = 'crashed-user'
    `;

    const replacement = await acquireEmbeddingRateLimit('crashed-user');
    expect(replacement.allowed).toBe(true);
  });

  it('enforces the per-user minute window after leases are released', async () => {
    const nowMs = Date.now();
    for (let index = 0; index < EMBEDDING_USER_WINDOW_LIMIT; index += 1) {
      const result = await acquireEmbeddingRateLimit('window-user', nowMs);
      expect(result.allowed).toBe(true);
      await releaseEmbeddingRateLimit(result.lease);
    }

    const denied = await acquireEmbeddingRateLimit('window-user', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'user_rate' });
  });

  it('enforces the global minute window across users', async () => {
    const nowMs = Date.now();
    for (let index = 0; index < EMBEDDING_GLOBAL_WINDOW_LIMIT; index += 1) {
      const result = await acquireEmbeddingRateLimit(`global-window-${index}`, nowMs);
      expect(result.allowed).toBe(true);
      await releaseEmbeddingRateLimit(result.lease);
    }

    const denied = await acquireEmbeddingRateLimit('global-window-overflow', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'global_rate' });
  });

  it('keeps the daily budget at its ceiling without an over-budget increment', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 12, 0, 0);
    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        'embedding:daily:2026-07-10',
        ${EMBEDDING_DAILY_BUDGET},
        NOW() + INTERVAL '26 hours',
        NOW()
      )
    `;

    const denied = await acquireEmbeddingDailyBudget(nowMs);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'daily_budget',
      count: EMBEDDING_DAILY_BUDGET,
      limit: EMBEDDING_DAILY_BUDGET,
    });

    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT "count"
      FROM "embedding_rate_buckets"
      WHERE "key" = 'embedding:daily:2026-07-10'
    `;
    expect(rows[0]?.count).toBe(EMBEDDING_DAILY_BUDGET);
  });

  it('starts a fresh budget bucket at UTC day rollover', async () => {
    const dayOne = await acquireEmbeddingDailyBudget(Date.UTC(2026, 6, 10, 23, 59, 59));
    const dayTwo = await acquireEmbeddingDailyBudget(Date.UTC(2026, 6, 11, 0, 0, 0));

    expect(dayOne).toMatchObject({ allowed: true, count: 1 });
    expect(dayTwo).toMatchObject({ allowed: true, count: 1 });

    const keys = await prisma.$queryRaw<Array<{ key: string }>>`
      SELECT "key"
      FROM "embedding_rate_buckets"
      WHERE "key" LIKE 'embedding:daily:%'
      ORDER BY "key"
    `;
    expect(keys.map(({ key }) => key)).toEqual([
      'embedding:daily:2026-07-10',
      'embedding:daily:2026-07-11',
    ]);
  });
});
