import { afterEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { ENROLLMENT_ADVISORY_LOCK_KEY } from '@/lib/enrollment/enrollment-policy';
import { prisma, syncUser } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

// Two contenders are sufficient to expose a check-then-insert race while
// keeping this integration oracle small when other DB contention tests run.
const userIds = Array.from({ length: 2 }, (_, index) => `enrollment-concurrency-${index}`);

async function withEnrollmentLock<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ENROLLMENT_ADVISORY_LOCK_KEY})`;
    return action(tx);
  });
}

async function cleanupTestUsers(): Promise<void> {
  await withEnrollmentLock((tx) => tx.user.deleteMany({ where: { id: { in: userIds } } }));
}

describeWithDatabase('Postgres enrollment ceiling', () => {
  afterEach(async () => {
    await cleanupTestUsers();
  });

  it('admits at most one concurrent new account at a one-account ceiling', async () => {
    const previousMode = process.env.SPLOOT_ENROLLMENT_MODE;
    const previousMax = process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS;
    process.env.SPLOOT_ENROLLMENT_MODE = 'capped';

    try {
      let fulfilledCount = 0;
      let deniedCount = 0;
      let unexpectedRejections: unknown[] = [];

      // The shared campaign may admit an unrelated user after setup. Rebuild
      // the ceiling from a lock-protected baseline and retry only when that
      // unrelated admission consumed the single slot before our contenders.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const baseline = await withEnrollmentLock((tx) => tx.user.count());
        process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS = String(baseline + 1);

        const results = await Promise.allSettled(
          userIds.map((id) => syncUser(id, `${id}@example.test`)),
        );
        fulfilledCount = results.filter((result) => result.status === 'fulfilled').length;
        deniedCount = results.filter((result) => (
          result.status === 'rejected' && (result.reason as { code?: unknown }).code === 'enrollment_closed'
        )).length;
        unexpectedRejections = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason)
          .filter((reason) => (reason as { code?: unknown }).code !== 'enrollment_closed');

        if (fulfilledCount === 1 || unexpectedRejections.length > 0) break;
        await cleanupTestUsers();
      }

      expect(unexpectedRejections).toEqual([]);
      expect(fulfilledCount).toBe(1);
      expect(deniedCount).toBe(userIds.length - 1);
      expect(await prisma.user.count({ where: { id: { in: userIds } } })).toBe(1);
    } finally {
      if (previousMode === undefined) delete process.env.SPLOOT_ENROLLMENT_MODE;
      else process.env.SPLOOT_ENROLLMENT_MODE = previousMode;
      if (previousMax === undefined) delete process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS;
      else process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS = previousMax;
      await cleanupTestUsers();
    }
  }, 30_000);
});
