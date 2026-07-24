import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { acquireInferenceBudget, refundInferenceBudget } from '@/lib/cost/counters';
import { admitCost } from '@/lib/cost/kernel';
import { CostAdmissionError } from '@/lib/cost/errors';
import { getPlanInferenceBudget } from '@/lib/cost/policy';

const describeWithDatabase = process.env.DATABASE_URL && prisma ? describe.sequential : describe.skip;

const TEST_KEY_PREFIX = 'cost:';
const TEST_USER_PREFIX = 'cost-admission-test-';

async function resetCostAdmissionState(): Promise<void> {
  await prisma.costAdmissionCounter.deleteMany({
    where: { key: { contains: `:${TEST_USER_PREFIX}` } },
  });
}

async function seedBucket(key: string, count: number, ttlMs: number): Promise<void> {
  await prisma.costAdmissionCounter.upsert({
    where: { key },
    create: { key, count, expiresAt: new Date(Date.now() + ttlMs) },
    update: { count, expiresAt: new Date(Date.now() + ttlMs) },
  });
}

describeWithDatabase('Postgres cost admission counters', () => {
  beforeEach(async () => {
    await resetCostAdmissionState();
  });

  afterAll(async () => {
    await resetCostAdmissionState();
  });

  it('admits up to the daily limit for one account+capability and denies the next with a stable reason', async () => {
    const userId = `${TEST_USER_PREFIX}daily-ceiling`;
    const dailyLimit = 3;
    const monthlyLimit = 100;

    for (let i = 0; i < dailyLimit; i += 1) {
      const result = await acquireInferenceBudget('embedding_query', userId, dailyLimit, monthlyLimit, 0.8);
      expect(result.allowed).toBe(true);
    }

    const denied = await acquireInferenceBudget('embedding_query', userId, dailyLimit, monthlyLimit, 0.8);
    expect(denied).toMatchObject({
      allowed: false,
      reason: 'user_daily_budget',
      dailyCount: dailyLimit,
      dailyLimit,
    });
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('settles concurrent admits at the boundary to exactly the daily limit -- no double-admit race', async () => {
    const userId = `${TEST_USER_PREFIX}race-boundary`;
    const dailyLimit = 5;
    const attempts = dailyLimit + 10;

    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        acquireInferenceBudget('embedding_index', userId, dailyLimit, 1000, 0.8)
      )
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(dailyLimit);
    expect(results.filter((r) => !r.allowed && r.reason === 'user_daily_budget')).toHaveLength(
      attempts - dailyLimit
    );

    const persisted = await prisma.costAdmissionCounter.findMany({
      where: { key: { startsWith: `cost:embedding_index:acct:${userId}:daily:` } },
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.count).toBe(dailyLimit);
  });

  it('refunding an admitted slot frees exactly one slot for a later admit', async () => {
    const userId = `${TEST_USER_PREFIX}refund`;
    const dailyLimit = 2;

    const first = await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, 0.8);
    const second = await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, 0.8);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    const denied = await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, 0.8);
    expect(denied.allowed).toBe(false);

    expect(second.allowed).toBe(true);
    if (second.allowed) {
      await refundInferenceBudget(second.keys);
    }

    const admittedAfterRefund = await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, 0.8);
    expect(admittedAfterRefund.allowed).toBe(true);
  });

  it('tracks embedding_index and embedding_query as independent counters for the same account', async () => {
    const userId = `${TEST_USER_PREFIX}distinguish-capability`;
    const dailyLimit = 2;

    // Exhaust the index budget only.
    await acquireInferenceBudget('embedding_index', userId, dailyLimit, 1000, 0.8);
    await acquireInferenceBudget('embedding_index', userId, dailyLimit, 1000, 0.8);
    const indexDenied = await acquireInferenceBudget('embedding_index', userId, dailyLimit, 1000, 0.8);
    expect(indexDenied.allowed).toBe(false);

    // The same account's query budget is untouched.
    const queryAdmission = await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, 0.8);
    expect(queryAdmission.allowed).toBe(true);
    expect(queryAdmission.dailyCount).toBe(1);
  });

  it('isolates per-account daily budgets across different accounts (multi-account / cron-amplification safety)', async () => {
    const dailyLimit = 1;
    const ownerA = `${TEST_USER_PREFIX}owner-a`;
    const ownerB = `${TEST_USER_PREFIX}owner-b`;

    const admissionA1 = await acquireInferenceBudget('embedding_index', ownerA, dailyLimit, 1000, 0.8);
    const admissionA2 = await acquireInferenceBudget('embedding_index', ownerA, dailyLimit, 1000, 0.8);
    expect(admissionA1.allowed).toBe(true);
    expect(admissionA2.allowed).toBe(false);

    // Owner A exhausting their own budget must not drain owner B's -- a cron
    // sweep across many owners' assets cannot starve unrelated accounts.
    const admissionB1 = await acquireInferenceBudget('embedding_index', ownerB, dailyLimit, 1000, 0.8);
    expect(admissionB1.allowed).toBe(true);
  });

  it('denies on the monthly ceiling even when the daily bucket still has headroom', async () => {
    const userId = `${TEST_USER_PREFIX}monthly-ceiling`;
    const dailyLimit = 1000;
    const monthlyLimit = 2;

    await acquireInferenceBudget('embedding_query', userId, dailyLimit, monthlyLimit, 0.8);
    await acquireInferenceBudget('embedding_query', userId, dailyLimit, monthlyLimit, 0.8);
    const denied = await acquireInferenceBudget('embedding_query', userId, dailyLimit, monthlyLimit, 0.8);

    expect(denied).toMatchObject({ allowed: false, reason: 'user_monthly_budget', monthlyCount: monthlyLimit });
  });

  it('flags warn once usage crosses the configured warn threshold, not before', async () => {
    const userId = `${TEST_USER_PREFIX}warn-threshold`;
    const dailyLimit = 5;
    const warnThreshold = 0.8; // warn at ceil(5 * 0.8) = 4

    const admissions = [];
    for (let i = 0; i < dailyLimit; i += 1) {
      admissions.push(await acquireInferenceBudget('embedding_query', userId, dailyLimit, 1000, warnThreshold));
    }

    expect(admissions.map((a) => a.warn)).toEqual([false, false, false, true, true]);
  });

  it('drives the full admitCost kernel end-to-end against the real free-tier plan budget', async () => {
    const userId = `${TEST_USER_PREFIX}end-to-end`;
    const freeBudget = getPlanInferenceBudget('free');
    const dailyKey = `cost:embedding_query:acct:${userId}:daily:${new Date().toISOString().slice(0, 10)}`;
    const monthlyKey = `cost:embedding_query:acct:${userId}:monthly:${new Date().toISOString().slice(0, 7)}`;

    // Pre-seed the daily bucket one below the real free-tier ceiling so the
    // test proves the wired end-to-end path without looping ~39 real admits.
    await seedBucket(dailyKey, freeBudget.dailyAttempts - 1, 26 * 60 * 60 * 1000);

    const lease = await admitCost({ capability: 'embedding_query', userId });
    expect(lease.warn).toBe(true);

    await expect(admitCost({ capability: 'embedding_query', userId })).rejects.toMatchObject({
      name: 'CostAdmissionError',
      reason: 'user_daily_budget',
    } satisfies Partial<CostAdmissionError>);

    await lease.refund();

    await expect(admitCost({ capability: 'embedding_query', userId })).resolves.toMatchObject({
      capability: 'embedding_query',
      userId,
    });

    await prisma.costAdmissionCounter.deleteMany({ where: { key: { in: [dailyKey, monthlyKey] } } });
  });

  it('admits concurrent upload churn for one account without corrupting any shared state', async () => {
    const userId = `${TEST_USER_PREFIX}upload-churn`;
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => admitCost({ capability: 'upload', userId, bytes: 1024 * (i + 1) }))
    );
    expect(results).toHaveLength(25);
    for (const lease of results) {
      expect(lease.capability).toBe('upload');
      await lease.commit();
    }
  });
});
