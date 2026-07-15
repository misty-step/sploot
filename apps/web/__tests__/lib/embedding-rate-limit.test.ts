import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: null,
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: mockLogError },
}));

import {
  acquireEmbeddingDailyBudget,
  acquireEmbeddingRateLimit,
  releaseEmbeddingRateLimit,
  EMBEDDING_DAILY_BUDGET,
  EMBEDDING_MONTHLY_BUDGET,
} from '@/lib/embedding-rate-limit';

import policy from '../../../../economics/policy.json';

describe('embedding limiter fail-closed behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies rate-limit acquisition when its Postgres store is unavailable', async () => {
    const result = await acquireEmbeddingRateLimit('user-1');

    expect(result).toMatchObject({ allowed: false, reason: 'limiter_unavailable' });
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('denies daily spend acquisition when its Postgres store is unavailable', async () => {
    const result = await acquireEmbeddingDailyBudget();

    expect(result).toMatchObject({
      allowed: false,
      reason: 'limiter_unavailable',
      count: 0,
      limit: EMBEDDING_DAILY_BUDGET,
    });
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('uses the versioned economic policy for global daily and monthly caps', () => {
    expect(EMBEDDING_DAILY_BUDGET).toBe(policy.global.replicateDailyAttempts);
    expect(EMBEDDING_MONTHLY_BUDGET).toBe(policy.global.replicateMonthlyAttempts);
    expect(EMBEDDING_DAILY_BUDGET).toBe(684);
    expect(EMBEDDING_MONTHLY_BUDGET).toBe(20_547);
  });

  it('treats releasing a missing lease as a no-op', async () => {
    await expect(releaseEmbeddingRateLimit(null)).resolves.toBeUndefined();
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
