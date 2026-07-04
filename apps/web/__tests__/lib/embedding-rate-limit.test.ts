import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockKv, mockLogError } = vi.hoisted(() => ({
  mockKv: { incr: vi.fn(), decr: vi.fn(), expire: vi.fn() },
  mockLogError: vi.fn(),
}));

vi.mock('@vercel/kv', () => ({
  kv: mockKv,
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: { logError: mockLogError },
}));

import {
  acquireEmbeddingRateLimit,
  acquireEmbeddingDailyBudget,
  releaseEmbeddingRateLimit,
  EMBEDDING_USER_CONCURRENCY_LIMIT,
  EMBEDDING_GLOBAL_CONCURRENCY_LIMIT,
  EMBEDDING_GLOBAL_WINDOW_LIMIT,
  EMBEDDING_DAILY_BUDGET,
} from '@/lib/embedding-rate-limit';

describe('embedding-rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKv.expire.mockResolvedValue(undefined);
    mockKv.decr.mockResolvedValue(0);
  });

  describe('acquireEmbeddingRateLimit — concurrency/window gates', () => {
    it('allows a request under every limit and returns a releasable lease', async () => {
      mockKv.incr.mockResolvedValue(1);

      const result = await acquireEmbeddingRateLimit('user-1');

      expect(result.allowed).toBe(true);
      expect(result.lease).toEqual({
        userId: 'user-1',
        inflightUserKey: 'embedding:inflight:user:user-1',
        inflightGlobalKey: 'embedding:inflight:global',
      });
      expect(mockLogError).not.toHaveBeenCalled();
    });

    it('denies over the per-user concurrency cap without a Canary report', async () => {
      mockKv.incr.mockResolvedValueOnce(EMBEDDING_USER_CONCURRENCY_LIMIT + 1); // user inflight
      mockKv.incr.mockResolvedValueOnce(1); // global inflight

      const result = await acquireEmbeddingRateLimit('user-1');

      expect(result).toMatchObject({ allowed: false, reason: 'user_concurrency' });
      // Per-user throttling is expected, routine behavior — not an incident.
      expect(mockLogError).not.toHaveBeenCalled();
    });

    it('denies over the global concurrency cap and reports a Canary breach', async () => {
      mockKv.incr.mockResolvedValueOnce(1); // user inflight
      mockKv.incr.mockResolvedValueOnce(EMBEDDING_GLOBAL_CONCURRENCY_LIMIT + 1); // global inflight

      const result = await acquireEmbeddingRateLimit('user-1');

      expect(result).toMatchObject({ allowed: false, reason: 'global_concurrency' });
      expect(mockLogError).toHaveBeenCalledWith(
        'embedding-rate-limit.global-concurrency-breach',
        expect.any(Error),
        expect.objectContaining({ limit: EMBEDDING_GLOBAL_CONCURRENCY_LIMIT })
      );
    });

    it('denies over the global rate window and reports a Canary breach', async () => {
      mockKv.incr.mockResolvedValueOnce(1); // user inflight
      mockKv.incr.mockResolvedValueOnce(1); // global inflight
      mockKv.incr.mockResolvedValueOnce(1); // user window
      mockKv.incr.mockResolvedValueOnce(EMBEDDING_GLOBAL_WINDOW_LIMIT + 1); // global window

      const result = await acquireEmbeddingRateLimit('user-1');

      expect(result).toMatchObject({ allowed: false, reason: 'global_rate' });
      expect(mockLogError).toHaveBeenCalledWith(
        'embedding-rate-limit.global-rate-breach',
        expect.any(Error),
        expect.objectContaining({ limit: EMBEDDING_GLOBAL_WINDOW_LIMIT })
      );
    });

    it('fails closed and reports to Canary when KV is unreachable', async () => {
      mockKv.incr.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await acquireEmbeddingRateLimit('user-1');

      expect(result).toMatchObject({ allowed: false, reason: 'kv_unavailable' });
      expect(mockLogError).toHaveBeenCalledWith(
        'embedding-rate-limit.kv-unavailable',
        expect.any(Error),
        expect.objectContaining({ userId: 'user-1' })
      );
    });
  });

  describe('releaseEmbeddingRateLimit', () => {
    it('decrements both inflight keys for a granted lease', async () => {
      await releaseEmbeddingRateLimit({
        userId: 'user-1',
        inflightUserKey: 'embedding:inflight:user:user-1',
        inflightGlobalKey: 'embedding:inflight:global',
      });

      expect(mockKv.decr).toHaveBeenCalledWith('embedding:inflight:user:user-1');
      expect(mockKv.decr).toHaveBeenCalledWith('embedding:inflight:global');
    });

    it('is a no-op when no lease was granted', async () => {
      await releaseEmbeddingRateLimit(null);
      expect(mockKv.decr).not.toHaveBeenCalled();
    });
  });

  describe('acquireEmbeddingDailyBudget', () => {
    it('allows spend under the daily ceiling', async () => {
      mockKv.incr.mockResolvedValue(1);

      const result = await acquireEmbeddingDailyBudget();

      expect(result).toEqual({ allowed: true, count: 1, limit: EMBEDDING_DAILY_BUDGET });
      expect(mockLogError).not.toHaveBeenCalled();
    });

    it('denies and reports a Canary breach once the daily ceiling is crossed', async () => {
      mockKv.incr.mockResolvedValue(EMBEDDING_DAILY_BUDGET + 1);

      const result = await acquireEmbeddingDailyBudget();

      expect(result).toMatchObject({
        allowed: false,
        reason: 'daily_budget',
        count: EMBEDDING_DAILY_BUDGET,
        limit: EMBEDDING_DAILY_BUDGET,
      });
      expect(result.retryAfterSec).toBeGreaterThan(0);
      expect(mockKv.decr).toHaveBeenCalled(); // over-budget increment rolled back
      expect(mockLogError).toHaveBeenCalledWith(
        'embedding-rate-limit.daily-budget-breach',
        expect.any(Error),
        expect.objectContaining({ limit: EMBEDDING_DAILY_BUDGET })
      );
    });

    it('fails closed and reports to Canary when KV is unreachable', async () => {
      mockKv.incr.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await acquireEmbeddingDailyBudget();

      expect(result).toMatchObject({ allowed: false, reason: 'kv_unavailable' });
      expect(mockLogError).toHaveBeenCalledWith(
        'embedding-rate-limit.daily-budget-kv-unavailable',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('keys the ceiling per UTC day', async () => {
      mockKv.incr.mockResolvedValue(1);

      await acquireEmbeddingDailyBudget(Date.UTC(2026, 0, 1, 12, 0, 0));
      await acquireEmbeddingDailyBudget(Date.UTC(2026, 0, 2, 0, 0, 0));

      expect(mockKv.incr).toHaveBeenNthCalledWith(1, 'embedding:daily:2026-01-01');
      expect(mockKv.incr).toHaveBeenNthCalledWith(2, 'embedding:daily:2026-01-02');
    });
  });
});
