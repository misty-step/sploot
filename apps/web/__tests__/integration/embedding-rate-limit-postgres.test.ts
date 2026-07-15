import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  acquireEmbeddingAdmissionReservation,
  acquireEmbeddingDailyBudget,
  acquireEmbeddingRateLimit,
  releaseEmbeddingRateLimit,
  EMBEDDING_DAILY_BUDGET,
  EMBEDDING_MONTHLY_BUDGET,
  EMBEDDING_GLOBAL_CONCURRENCY_LIMIT,
  EMBEDDING_GLOBAL_WINDOW_LIMIT,
  EMBEDDING_USER_WINDOW_LIMIT,
} from '@/lib/embedding-rate-limit';
import { prisma } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const limiterAdmin = process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL
  ? new PrismaClient({
      datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL } },
    })
  : prisma;

const limiterUserIds = [
  'user-lease',
  'crashed-user',
  'window-user',
  'global-window-overflow',
  'atomic-denial',
  // The limiter now proves enrollment (an existing users row) inside the
  // admission transaction, so every synthetic caller must be enrolled.
  'atomic-user-a',
  'atomic-user-b',
  ...Array.from({ length: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT + 5 }, (_, index) => `concurrent-user-${index}`),
  ...Array.from({ length: EMBEDDING_GLOBAL_WINDOW_LIMIT }, (_, index) => `global-window-${index}`),
];
const TEST_WINDOW_MS = Date.now();
const TEST_WINDOW_ID = Math.floor(TEST_WINDOW_MS / 60_000);
const TEST_DAY_ONE_MS = Date.UTC(2026, 6, 10, 12, 0, 0);
const TEST_DAY_TWO_MS = Date.UTC(2026, 6, 11, 0, 0, 0);

async function resetLimiterState(): Promise<void> {
  await prisma.embeddingRateLease.deleteMany({
    where: { userId: { in: limiterUserIds } },
  });
  await prisma.embeddingRateBucket.deleteMany({
    where: {
      OR: [
        ...limiterUserIds.map((userId) => ({ key: { startsWith: `embedding:rate:user:${userId}:` } })),
        { key: `embedding:rate:global:${TEST_WINDOW_ID}` },
        { key: 'embedding:daily:2026-07-10' },
        { key: 'embedding:daily:2026-07-11' },
        { key: 'embedding:daily:2026-07-31' },
        { key: 'embedding:daily:2026-08-01' },
        { key: 'embedding:monthly:2026-07' },
        { key: 'embedding:monthly:2026-08' },
      ],
    },
  });
}

async function resetLimiterUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { id: { in: limiterUserIds } } });
  await prisma.user.createMany({
    data: limiterUserIds.map((id) => ({ id, email: `${id}@example.test` })),
  });
}

describeWithDatabase('Postgres embedding limiter', () => {
  beforeEach(async () => {
    await resetLimiterState();
    await resetLimiterUsers();
  });

  afterAll(async () => {
    await resetLimiterState();
    await prisma.user.deleteMany({ where: { id: { in: limiterUserIds } } });
    if (limiterAdmin !== prisma) await limiterAdmin.$disconnect();
  });

  it('persists a releasable lease for an allowed request', async () => {
    const result = await acquireEmbeddingRateLimit('user-lease', TEST_WINDOW_MS);

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
    const nowMs = TEST_WINDOW_MS;
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
    const first = await acquireEmbeddingRateLimit('crashed-user', TEST_WINDOW_MS);
    expect(first.allowed).toBe(true);

    await prisma.$executeRaw`
      UPDATE "embedding_rate_leases"
      SET "expires_at" = NOW() - INTERVAL '1 second'
      WHERE "user_id" = 'crashed-user'
    `;

    const replacement = await acquireEmbeddingRateLimit('crashed-user', TEST_WINDOW_MS);
    expect(replacement.allowed).toBe(true);
  });

  it('enforces the per-user minute window after leases are released', async () => {
    const nowMs = TEST_WINDOW_MS;
    for (let index = 0; index < EMBEDDING_USER_WINDOW_LIMIT; index += 1) {
      const result = await acquireEmbeddingRateLimit('window-user', nowMs);
      expect(result.allowed).toBe(true);
      await releaseEmbeddingRateLimit(result.lease);
    }

    const denied = await acquireEmbeddingRateLimit('window-user', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'user_rate' });
  });

  it('enforces the global minute window across users', async () => {
    const nowMs = TEST_WINDOW_MS;
    for (let index = 0; index < EMBEDDING_GLOBAL_WINDOW_LIMIT; index += 1) {
      const result = await acquireEmbeddingRateLimit(`global-window-${index}`, nowMs);
      expect(result.allowed).toBe(true);
      await releaseEmbeddingRateLimit(result.lease);
    }

    const denied = await acquireEmbeddingRateLimit('global-window-overflow', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'global_rate' });
  });

  it('keeps the daily budget at its ceiling without an over-budget increment', async () => {
    const nowMs = TEST_DAY_ONE_MS;
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

  it('keeps the economic ceilings fail-closed under an older runtime write', async () => {
    await expect(prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        'embedding:daily:2026-07-10',
        ${EMBEDDING_DAILY_BUDGET + 1},
        NOW() + INTERVAL '26 hours',
        NOW()
      )
    `).rejects.toThrow(/embedding_budget_hard_ceiling/);

    await expect(prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        'embedding:monthly:2026-07',
        ${EMBEDDING_MONTHLY_BUDGET + 1},
        NOW() + INTERVAL '32 days',
        NOW()
      )
    `).rejects.toThrow(/embedding_budget_hard_ceiling/);
  });

  it('keeps every bucket and lease unchanged when atomic admission is denied by the daily ceiling', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 12, 0, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const dailyKey = 'embedding:daily:2026-07-10';
    const monthlyKey = 'embedding:monthly:2026-07';
    const userKey = `embedding:rate:user:atomic-denial:${windowId}`;
    const globalKey = `embedding:rate:global:${windowId}`;

    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        ${dailyKey},
        ${EMBEDDING_DAILY_BUDGET},
        NOW() + INTERVAL '26 hours',
        NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (${monthlyKey}, 7, NOW() + INTERVAL '32 days', NOW())
    `;

    const before = await prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT "key", "count"
      FROM "embedding_rate_buckets"
      WHERE "key" IN (${dailyKey}, ${monthlyKey}, ${userKey}, ${globalKey})
      ORDER BY "key"
    `;

    const denied = await acquireEmbeddingAdmissionReservation('atomic-denial', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'daily_budget' });

    const after = await prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT "key", "count"
      FROM "embedding_rate_buckets"
      WHERE "key" IN (${dailyKey}, ${monthlyKey}, ${userKey}, ${globalKey})
      ORDER BY "key"
    `;
    const leaseCount = await prisma.embeddingRateLease.count({
      where: { userId: 'atomic-denial' },
    });

    expect(after).toEqual(before);
    expect(leaseCount).toBe(0);
  });

  it('keeps minute, daily, and lease state unchanged at the monthly ceiling', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 12, 0, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const monthlyKey = 'embedding:monthly:2026-07';
    const dailyKey = 'embedding:daily:2026-07-10';
    const userKey = `embedding:rate:user:atomic-user-a:${windowId}`;
    const globalKey = `embedding:rate:global:${windowId}`;

    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        ${monthlyKey},
        ${EMBEDDING_MONTHLY_BUDGET},
        NOW() + INTERVAL '32 days',
        NOW()
      )
    `;

    const denied = await acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs);
    expect(denied).toMatchObject({ allowed: false, reason: 'monthly_budget' });

    const buckets = await prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT "key", "count"
      FROM "embedding_rate_buckets"
      WHERE "key" IN (${monthlyKey}, ${dailyKey}, ${userKey}, ${globalKey})
      ORDER BY "key"
    `;
    expect(buckets).toEqual([
      { key: monthlyKey, count: EMBEDDING_MONTHLY_BUDGET },
    ]);
    expect(await prisma.embeddingRateLease.count({
      where: { userId: 'atomic-user-a' },
    })).toBe(0);
  });

  it('refunds the exact minute, day, and month reservation once', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 14, 0, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const admitted = await acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs);
    expect(admitted.allowed).toBe(true);
    const reservation = admitted.reservation!;

    await refundEmbeddingAdmissionCapacity(
      reservation.lease,
      reservation.dailyReservation,
    );
    await refundEmbeddingAdmissionCapacity(
      reservation.lease,
      reservation.dailyReservation,
    );

    const keys = [
      `embedding:rate:user:atomic-user-a:${windowId}`,
      `embedding:rate:global:${windowId}`,
      'embedding:daily:2026-07-10',
      'embedding:monthly:2026-07',
    ];
    const buckets = await prisma.embeddingRateBucket.findMany({
      where: { key: { in: keys } },
      select: { key: true, count: true },
      orderBy: { key: 'asc' },
    });
    expect(buckets).toHaveLength(4);
    expect(buckets.every(({ count }) => count === 0)).toBe(true);
    expect(await prisma.embeddingRateLease.count({
      where: { id: reservation.lease.id },
    })).toBe(0);
  });

  it('keeps the only lease when an atomic refund fails, then retries safely', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 14, 30, 0);
    const admitted = await acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs);
    expect(admitted.allowed).toBe(true);
    const reservation = admitted.reservation!;

    await limiterAdmin.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sploot_test_refund_failure()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced refund failure';
      END;
      $$
    `);
    await limiterAdmin.$executeRawUnsafe(`
      CREATE TRIGGER sploot_test_refund_failure_trigger
      BEFORE UPDATE ON "embedding_rate_buckets"
      FOR EACH ROW EXECUTE FUNCTION sploot_test_refund_failure()
    `);

    try {
      await expect(
        refundEmbeddingAdmissionCapacity(
          reservation.lease,
          reservation.dailyReservation,
        ),
      ).rejects.toThrow('forced refund failure');

      expect(await prisma.embeddingRateLease.count({
        where: { id: reservation.lease.id },
      })).toBe(1);
      const windowId = reservation.lease.windowId ?? Math.floor(nowMs / 60_000);
      const reservationKeys = [
        `embedding:rate:user:${reservation.lease.userId}:${windowId}`,
        `embedding:rate:global:${windowId}`,
        `embedding:daily:${reservation.dailyReservation?.dateKey}`,
        `embedding:monthly:${reservation.dailyReservation?.monthKey}`,
      ];
      const charged = await prisma.embeddingRateBucket.findMany({
        where: { key: { in: reservationKeys } },
        select: { count: true },
      });
      expect(charged).toHaveLength(4);
      expect(charged.filter(({ count }) => count === 1)).toHaveLength(4);
    } finally {
      await limiterAdmin.$executeRawUnsafe('DROP TRIGGER IF EXISTS sploot_test_refund_failure_trigger ON "embedding_rate_buckets"');
      await limiterAdmin.$executeRawUnsafe('DROP FUNCTION IF EXISTS sploot_test_refund_failure()');
    }

    await expect(
      refundEmbeddingAdmissionCapacity(
        reservation.lease,
        reservation.dailyReservation,
      ),
    ).resolves.toBe(true);
    expect(await prisma.embeddingRateLease.count({
      where: { id: reservation.lease.id },
    })).toBe(0);
  });

  it('releases the lease and surviving capacity when one reserved bucket was pruned', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 14, 5, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const admitted = await acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs);
    expect(admitted.allowed).toBe(true);
    const reservation = admitted.reservation!;
    const missingKey = `embedding:rate:user:atomic-user-a:${windowId}`;

    await prisma.embeddingRateBucket.delete({ where: { key: missingKey } });
    await refundEmbeddingAdmissionCapacity(
      reservation.lease,
      reservation.dailyReservation,
    );

    const survivingKeys = [
      `embedding:rate:global:${windowId}`,
      'embedding:daily:2026-07-10',
      'embedding:monthly:2026-07',
    ];
    const buckets = await prisma.embeddingRateBucket.findMany({
      where: { key: { in: survivingKeys } },
      select: { key: true, count: true },
      orderBy: { key: 'asc' },
    });
    expect(buckets).toHaveLength(3);
    expect(buckets.every(({ count }) => count === 0)).toBe(true);
    expect(await prisma.embeddingRateLease.count({
      where: { id: reservation.lease.id },
    })).toBe(0);
  });


  it('serializes concurrent denials without over-refunding a surviving reservation', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 13, 0, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const dailyKey = 'embedding:daily:2026-07-10';
    const monthlyKey = 'embedding:monthly:2026-07';

    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        ${dailyKey},
        ${EMBEDDING_DAILY_BUDGET - 1},
        NOW() + INTERVAL '26 hours',
        NOW()
      )
    `;

    const [first, second] = await Promise.all([
      acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs),
      acquireEmbeddingAdmissionReservation('atomic-user-b', nowMs),
    ]);

    const allowedResult = first.allowed ? first : second;
    const deniedResult = first.allowed ? second : first;
    expect(allowedResult.allowed).toBe(true);
    expect(deniedResult).toMatchObject({ allowed: false, reason: 'daily_budget' });

    const userAKey = `embedding:rate:user:atomic-user-a:${windowId}`;
    const userBKey = `embedding:rate:user:atomic-user-b:${windowId}`;
    const globalKey = `embedding:rate:global:${windowId}`;
    const allowedUserId = allowedResult.reservation!.lease.userId;
    const deniedUserKey =
      allowedUserId === 'atomic-user-a' ? userBKey : userAKey;
    const buckets = await prisma.$queryRaw<Array<{ key: string; count: number }>>`
      SELECT "key", "count"
      FROM "embedding_rate_buckets"
      WHERE "key" IN (${dailyKey}, ${monthlyKey}, ${userAKey}, ${userBKey}, ${globalKey})
      ORDER BY "key"
    `;
    const leases = await prisma.embeddingRateLease.findMany({
      where: { userId: { in: ['atomic-user-a', 'atomic-user-b'] } },
      select: { userId: true },
    });

    expect(buckets).toContainEqual({ key: dailyKey, count: EMBEDDING_DAILY_BUDGET });
    expect(buckets).toContainEqual({ key: monthlyKey, count: 1 });
    expect(buckets).toContainEqual({ key: globalKey, count: 1 });
    expect(buckets).toContainEqual({
      key: `embedding:rate:user:${allowedUserId}:${windowId}`,
      count: 1,
    });
    expect(buckets).not.toContainEqual({
      key: deniedUserKey,
      count: 1,
    });
    expect(leases).toEqual([{ userId: allowedUserId }]);
  });

  it('serializes concurrent admissions at the monthly ceiling without partial reservations', async () => {
    const nowMs = Date.UTC(2026, 6, 10, 13, 30, 0);
    const windowId = Math.floor(nowMs / 60_000);
    const monthlyKey = 'embedding:monthly:2026-07';
    const dailyKey = 'embedding:daily:2026-07-10';
    const globalKey = `embedding:rate:global:${windowId}`;

    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        ${monthlyKey},
        ${EMBEDDING_MONTHLY_BUDGET - 1},
        NOW() + INTERVAL '32 days',
        NOW()
      )
    `;

    const [first, second] = await Promise.all([
      acquireEmbeddingAdmissionReservation('atomic-user-a', nowMs),
      acquireEmbeddingAdmissionReservation('atomic-user-b', nowMs),
    ]);

    const allowedResult = first.allowed ? first : second;
    const deniedResult = first.allowed ? second : first;
    expect(allowedResult.allowed).toBe(true);
    expect(deniedResult).toMatchObject({
      allowed: false,
      reason: 'monthly_budget',
    });

    const allowedUserId = allowedResult.reservation!.lease.userId;
    const deniedUserId = allowedUserId === 'atomic-user-a'
      ? 'atomic-user-b'
      : 'atomic-user-a';
    const buckets = await prisma.embeddingRateBucket.findMany({
      where: {
        key: {
          in: [
            monthlyKey,
            dailyKey,
            globalKey,
            `embedding:rate:user:atomic-user-a:${windowId}`,
            `embedding:rate:user:atomic-user-b:${windowId}`,
          ],
        },
      },
      select: { key: true, count: true },
    });
    const leases = await prisma.embeddingRateLease.findMany({
      where: { userId: { in: ['atomic-user-a', 'atomic-user-b'] } },
      select: { userId: true },
    });

    expect(buckets).toContainEqual({
      key: monthlyKey,
      count: EMBEDDING_MONTHLY_BUDGET,
    });
    expect(buckets).toContainEqual({ key: dailyKey, count: 1 });
    expect(buckets).toContainEqual({ key: globalKey, count: 1 });
    expect(buckets).toContainEqual({
      key: `embedding:rate:user:${allowedUserId}:${windowId}`,
      count: 1,
    });
    expect(buckets).not.toContainEqual({
      key: `embedding:rate:user:${deniedUserId}:${windowId}`,
      count: 1,
    });
    expect(leases).toEqual([{ userId: allowedUserId }]);
  });

  it('starts a fresh budget bucket at UTC day rollover', async () => {
    const dayOne = await acquireEmbeddingDailyBudget(TEST_DAY_ONE_MS);
    const dayTwo = await acquireEmbeddingDailyBudget(TEST_DAY_TWO_MS);

    expect(dayOne).toMatchObject({ allowed: true, count: 1 });
    expect(dayTwo).toMatchObject({ allowed: true, count: 1 });

    const keys = await prisma.$queryRaw<Array<{ key: string }>>`
      SELECT "key"
      FROM "embedding_rate_buckets"
      WHERE "key" IN ('embedding:daily:2026-07-10', 'embedding:daily:2026-07-11')
      ORDER BY "key"
    `;
    expect(keys.map(({ key }) => key)).toEqual([
      'embedding:daily:2026-07-10',
      'embedding:daily:2026-07-11',
    ]);
  });

  it('starts a fresh monthly budget at the UTC month boundary', async () => {
    const julyEndMs = Date.UTC(2026, 6, 31, 23, 59, 59, 500);
    const augustStartMs = Date.UTC(2026, 7, 1, 0, 0, 0);

    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        'embedding:monthly:2026-07',
        ${EMBEDDING_MONTHLY_BUDGET},
        NOW() + INTERVAL '32 days',
        NOW()
      )
    `;

    const julyDenied = await acquireEmbeddingAdmissionReservation(
      'atomic-user-a',
      julyEndMs,
    );
    expect(julyDenied).toMatchObject({
      allowed: false,
      reason: 'monthly_budget',
      retryAfterSec: 1,
    });

    const augustAllowed = await acquireEmbeddingAdmissionReservation(
      'atomic-user-b',
      augustStartMs,
    );
    expect(augustAllowed).toMatchObject({
      allowed: true,
      reservation: {
        dailyReservation: {
          dateKey: '2026-08-01',
          monthKey: '2026-08',
        },
        counts: {
          dailyBudget: 1,
          monthlyBudget: 1,
        },
      },
    });

    const monthlyBuckets = await prisma.embeddingRateBucket.findMany({
      where: {
        key: { in: ['embedding:monthly:2026-07', 'embedding:monthly:2026-08'] },
      },
      select: { key: true, count: true },
      orderBy: { key: 'asc' },
    });
    expect(monthlyBuckets).toEqual([
      { key: 'embedding:monthly:2026-07', count: EMBEDDING_MONTHLY_BUDGET },
      { key: 'embedding:monthly:2026-08', count: 1 },
    ]);
  });

  it('enforces the versioned monthly global budget without an over-budget increment', async () => {
    await prisma.$executeRaw`
      INSERT INTO "embedding_rate_buckets" ("key", "count", "expires_at", "updated_at")
      VALUES (
        'embedding:monthly:2026-07',
        ${EMBEDDING_MONTHLY_BUDGET},
        NOW() + INTERVAL '32 days',
        NOW()
      )
    `;

    const denied = await acquireEmbeddingDailyBudget(TEST_DAY_ONE_MS);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'monthly_budget',
      count: EMBEDDING_MONTHLY_BUDGET,
      limit: EMBEDDING_MONTHLY_BUDGET,
    });

    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT "count"
      FROM "embedding_rate_buckets"
      WHERE "key" = 'embedding:monthly:2026-07'
    `;
    expect(rows[0]?.count).toBe(EMBEDDING_MONTHLY_BUDGET);
  });

});
