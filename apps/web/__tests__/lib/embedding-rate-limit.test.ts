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
} from '@/lib/embedding-rate-limit';

describe('embedding limiter fail-closed behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies rate-limit acquisition when its Postgres store is unavailable', async () => {
    const result = await acquireEmbeddingRateLimit('user-1');

    expect(result).toMatchObject({ allowed: false, reason: 'limiter_unavailable' });
    expect(mockLogError).toHaveBeenCalledWith(
      'embedding-rate-limit.store-unavailable',
      expect.any(Error),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('denies daily spend acquisition when its Postgres store is unavailable', async () => {
    const result = await acquireEmbeddingDailyBudget();

    expect(result).toMatchObject({
      allowed: false,
      reason: 'limiter_unavailable',
      count: 0,
      limit: EMBEDDING_DAILY_BUDGET,
    });
    expect(mockLogError).toHaveBeenCalledWith(
      'embedding-rate-limit.daily-budget-store-unavailable',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('treats releasing a missing lease as a no-op', async () => {
    await expect(releaseEmbeddingRateLimit(null)).resolves.toBeUndefined();
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
