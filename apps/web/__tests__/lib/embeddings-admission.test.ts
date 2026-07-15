import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replicateRun: vi.fn(),
  getTextEmbedding: vi.fn(),
  setTextEmbedding: vi.fn(),
  getImageEmbedding: vi.fn(),
  setImageEmbedding: vi.fn(),
  acquireEmbeddingRateLimit: vi.fn(),
  acquireEmbeddingDailyBudget: vi.fn(),
  refundEmbeddingBudget: vi.fn(),
  releaseEmbeddingRateLimit: vi.fn(),
}));

vi.mock('replicate', () => ({
  default: class Replicate {
    run = mocks.replicateRun;
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    getTextEmbedding: mocks.getTextEmbedding,
    setTextEmbedding: mocks.setTextEmbedding,
    getImageEmbedding: mocks.getImageEmbedding,
    setImageEmbedding: mocks.setImageEmbedding,
  }),
}));

vi.mock('@/lib/embedding-rate-limit', () => ({
  acquireEmbeddingRateLimit: mocks.acquireEmbeddingRateLimit,
  acquireEmbeddingDailyBudget: mocks.acquireEmbeddingDailyBudget,
  refundEmbeddingBudget: mocks.refundEmbeddingBudget,
  releaseEmbeddingRateLimit: mocks.releaseEmbeddingRateLimit,
}));

import {
  createEmbeddingService,
  DEFAULT_TIMEOUT,
  EmbeddingAdmissionError,
} from '@/lib/embeddings';

describe('central Replicate admission boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8_test_token');
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'true');
    mocks.getTextEmbedding.mockResolvedValue(null);
    mocks.getImageEmbedding.mockResolvedValue(null);
    mocks.acquireEmbeddingRateLimit.mockResolvedValue({
      allowed: true,
      lease: { id: 'lease-1', userId: 'user-1' },
    });
    mocks.acquireEmbeddingDailyBudget.mockResolvedValue({
      allowed: true,
      count: 1,
      limit: 2000,
      reservation: { dateKey: '2026-07-15', monthKey: '2026-07' },
    });
    mocks.releaseEmbeddingRateLimit.mockResolvedValue(undefined);
    mocks.refundEmbeddingBudget.mockResolvedValue(undefined);
    mocks.replicateRun.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('admits and releases every paid text embedding cache miss', async () => {
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('tiny hat')).resolves.toMatchObject({
      embedding: [0.1, 0.2, 0.3],
      dimension: 3,
    });

    expect(mocks.acquireEmbeddingRateLimit).toHaveBeenCalledWith('user-1');
    expect(mocks.acquireEmbeddingDailyBudget).toHaveBeenCalledOnce();
    expect(mocks.refundEmbeddingBudget).not.toHaveBeenCalled();
    expect(mocks.replicateRun).toHaveBeenCalledOnce();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledWith({
      id: 'lease-1',
      userId: 'user-1',
    });
  });

  it('applies the same admission boundary to image embedding cache misses', async () => {
    const service = createEmbeddingService('user-1');

    await service.embedImage('https://blob.example/cat.jpg', 'checksum-1');

    expect(mocks.acquireEmbeddingRateLimit).toHaveBeenCalledWith('user-1');
    expect(mocks.acquireEmbeddingDailyBudget).toHaveBeenCalledOnce();
    expect(mocks.refundEmbeddingBudget).not.toHaveBeenCalled();
    expect(mocks.replicateRun).toHaveBeenCalledOnce();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledOnce();
  });

  it('fails closed and releases the rate lease when the daily budget is exhausted', async () => {
    mocks.acquireEmbeddingDailyBudget.mockResolvedValue({
      allowed: false,
      reason: 'daily_budget',
      count: 2000,
      limit: 2000,
      retryAfterSec: 3600,
    });
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('new unique query')).rejects.toMatchObject({
      name: 'EmbeddingAdmissionError',
      reason: 'daily_budget',
      retryAfterSec: 3600,
      statusCode: 429,
    } satisfies Partial<EmbeddingAdmissionError>);

    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledOnce();
  });

  it('fails closed before daily accounting when the limiter is unavailable', async () => {
    mocks.acquireEmbeddingRateLimit.mockResolvedValue({
      allowed: false,
      reason: 'limiter_unavailable',
      retryAfterSec: 30,
    });
    const service = createEmbeddingService('user-1');

    await expect(
      service.embedImage('https://blob.example/cat.jpg')
    ).rejects.toMatchObject({
      name: 'EmbeddingAdmissionError',
      reason: 'limiter_unavailable',
      retryAfterSec: 30,
      statusCode: 503,
    } satisfies Partial<EmbeddingAdmissionError>);

    expect(mocks.acquireEmbeddingDailyBudget).not.toHaveBeenCalled();
    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).not.toHaveBeenCalled();
  });

  it('does not spend admission capacity on a durable cache hit', async () => {
    mocks.getTextEmbedding.mockResolvedValue([0.4, 0.5, 0.6]);
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('cached query')).resolves.toMatchObject({
      embedding: [0.4, 0.5, 0.6],
    });

    expect(mocks.acquireEmbeddingRateLimit).not.toHaveBeenCalled();
    expect(mocks.acquireEmbeddingDailyBudget).not.toHaveBeenCalled();
    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).not.toHaveBeenCalled();
  });

  it('aborts one provider attempt before releasing its admission on timeout', async () => {
    vi.useFakeTimers();
    let providerSettled = false;

    mocks.replicateRun.mockImplementation(
      (_model: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener(
            'abort',
            () => {
              providerSettled = true;
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        })
    );
    mocks.releaseEmbeddingRateLimit.mockImplementation(async () => {
      expect(providerSettled).toBe(true);
    });

    const service = createEmbeddingService('user-1');
    const embedding = service.embedText('timeout query');
    const rejection = expect(embedding).rejects.toMatchObject({
      name: 'EmbeddingError',
      statusCode: 504,
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT);
    await rejection;

    expect(mocks.replicateRun).toHaveBeenCalledOnce();
    const options = mocks.replicateRun.mock.calls[0]?.[1] as {
      signal?: AbortSignal;
      wait?: { mode?: string };
    };
    expect(options.wait).toEqual({ mode: 'poll' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(true);
    expect(mocks.acquireEmbeddingDailyBudget).toHaveBeenCalledOnce();
    expect(mocks.refundEmbeddingBudget).toHaveBeenCalledWith({
      dateKey: '2026-07-15',
      monthKey: '2026-07',
    });
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledOnce();
  });
});
