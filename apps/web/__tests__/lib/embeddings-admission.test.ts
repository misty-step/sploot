import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const InstalledReplicateApiError = require('replicate/lib/error') as new (
  message: string,
  request: Request,
  response: Response,
) => Error & { response: Response };

const mocks = vi.hoisted(() => ({
  replicateRun: vi.fn(),
  getTextEmbedding: vi.fn(),
  setTextEmbedding: vi.fn(),
  getImageEmbedding: vi.fn(),
  setImageEmbedding: vi.fn(),
  acquireEmbeddingAdmissionReservation: vi.fn(),
  acquireEmbeddingRateLimit: vi.fn(),
  acquireEmbeddingDailyBudget: vi.fn(),
  refundEmbeddingAdmissionCapacity: vi.fn(),
  releaseEmbeddingRateLimit: vi.fn(),
  recordEmbeddingProviderSuccess: vi.fn(),
  acquireEmbeddingProviderAdmission: vi.fn(),
  getEmbeddingProviderCircuit: vi.fn(),
  recordEmbeddingAdmissionFailure: vi.fn(),
  recordEmbeddingProviderFailure: vi.fn(),
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
  acquireEmbeddingAdmissionReservation: mocks.acquireEmbeddingAdmissionReservation,
  acquireEmbeddingRateLimit: mocks.acquireEmbeddingRateLimit,
  acquireEmbeddingDailyBudget: mocks.acquireEmbeddingDailyBudget,
  refundEmbeddingAdmissionCapacity: mocks.refundEmbeddingAdmissionCapacity,
  releaseEmbeddingRateLimit: mocks.releaseEmbeddingRateLimit,
}));

/* The default provider admission is open; individual tests can close it. */
vi.mock('@/lib/embedding-resilience', () => ({
  acquireEmbeddingProviderAdmission: mocks.acquireEmbeddingProviderAdmission,
  getEmbeddingProviderCircuit: mocks.getEmbeddingProviderCircuit,
  isGlobalEmbeddingAdmissionReason: (reason: string) =>
    ['global_rate', 'global_concurrency', 'daily_budget', 'limiter_unavailable'].includes(reason),
  isCircuitOpeningAdmissionReason: (reason: string) =>
    ['global_rate', 'daily_budget', 'limiter_unavailable'].includes(reason),
  recordEmbeddingAdmissionFailure: mocks.recordEmbeddingAdmissionFailure,
  recordEmbeddingProviderFailure: mocks.recordEmbeddingProviderFailure,
  recordEmbeddingProviderSuccess: mocks.recordEmbeddingProviderSuccess,
}));

import {
  createEmbeddingService,
  DEFAULT_TIMEOUT,
  EmbeddingAdmissionError,
} from '@/lib/embeddings';
import {
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
} from '@/lib/embedding-errors';
import { EMBEDDING_DIMENSION } from '@sploot/common';

describe('central Replicate admission boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('REPLICATE_API_TOKEN', 'r8_test_token');
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'true');
    mocks.acquireEmbeddingProviderAdmission.mockResolvedValue({
      allowed: true,
      lease: { generation: 0, probeGeneration: null, probeLeaseToken: null },
    });
    mocks.getEmbeddingProviderCircuit.mockResolvedValue({
      available: true,
      open: false,
      generation: 0,
    });
    mocks.getTextEmbedding.mockResolvedValue(null);
    mocks.getImageEmbedding.mockResolvedValue(null);
    mocks.acquireEmbeddingAdmissionReservation.mockResolvedValue({
      allowed: true,
      reservation: {
        lease: { id: 'lease-1', userId: 'user-1', windowId: 1 },
        dailyReservation: { dateKey: '2026-07-14' },
        counts: {
          userWindow: 1,
          globalWindow: 1,
          dailyBudget: 1,
        },
      },
    });
    mocks.releaseEmbeddingRateLimit.mockResolvedValue(undefined);
    mocks.recordEmbeddingProviderSuccess.mockResolvedValue(true);
    mocks.recordEmbeddingAdmissionFailure.mockResolvedValue(undefined);
    mocks.recordEmbeddingProviderFailure.mockResolvedValue(undefined);
    mocks.replicateRun.mockResolvedValue(new Array(EMBEDDING_DIMENSION).fill(0.1));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('admits and releases every paid text embedding cache miss', async () => {
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('tiny hat')).resolves.toMatchObject({
      embedding: new Array(EMBEDDING_DIMENSION).fill(0.1),
      dimension: EMBEDDING_DIMENSION,
    });

    expect(mocks.acquireEmbeddingAdmissionReservation).toHaveBeenCalledWith('user-1');
    expect(mocks.replicateRun).toHaveBeenCalledOnce();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledWith({
      id: 'lease-1',
      userId: 'user-1',
      windowId: 1,
    });
  });

  it('applies the same admission boundary to image embedding cache misses', async () => {
    const service = createEmbeddingService('user-1');

    await service.embedImage('https://blob.example/cat.jpg', 'checksum-1');

    expect(mocks.acquireEmbeddingAdmissionReservation).toHaveBeenCalledWith('user-1');
    expect(mocks.replicateRun).toHaveBeenCalledOnce();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledOnce();
  });

  it('fails closed and releases the rate lease when the daily budget is exhausted', async () => {
    mocks.acquireEmbeddingAdmissionReservation.mockResolvedValue({
      allowed: false,
      reason: 'daily_budget',
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
    expect(mocks.recordEmbeddingProviderFailure).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledWith(undefined);
  });

  it('fails closed before daily accounting when the limiter is unavailable', async () => {
    mocks.acquireEmbeddingAdmissionReservation.mockResolvedValue({
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

    expect(mocks.acquireEmbeddingAdmissionReservation).toHaveBeenCalledOnce();
    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.recordEmbeddingProviderFailure).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledWith(undefined);
  });

  it('records a durable circuit failure for a global window denial', async () => {
    mocks.acquireEmbeddingAdmissionReservation.mockResolvedValue({
      allowed: false,
      reason: 'global_rate',
      retryAfterSec: 42,
    });
    const service = createEmbeddingService('user-1');

    await expect(service.embedImage('https://blob.example/cat.jpg')).rejects.toMatchObject({
      name: 'EmbeddingAdmissionError',
      reason: 'global_rate',
    });

    expect(mocks.recordEmbeddingAdmissionFailure).toHaveBeenCalledWith('global_rate', 42);
    expect(mocks.replicateRun).not.toHaveBeenCalled();
  });

  it('does not open the shared circuit for ordinary global concurrency saturation', async () => {
    mocks.acquireEmbeddingAdmissionReservation.mockResolvedValue({
      allowed: false,
      reason: 'global_concurrency',
      retryAfterSec: 180,
    });
    const service = createEmbeddingService('user-1');

    await expect(service.embedImage('https://blob.example/cat.jpg')).rejects.toMatchObject({
      name: 'EmbeddingAdmissionError',
      reason: 'global_concurrency',
      statusCode: 429,
      retryAfterSec: 180,
    });

    // In-flight saturation self-resolves as leases release; a durable open
    // interval here would turn healthy throughput into a multi-minute outage.
    expect(mocks.recordEmbeddingAdmissionFailure).not.toHaveBeenCalled();
    expect(mocks.recordEmbeddingProviderFailure).not.toHaveBeenCalled();
    expect(mocks.replicateRun).not.toHaveBeenCalled();
  });

  it('does not feed a durable circuit denial back into provider failure recording', async () => {
    mocks.acquireEmbeddingProviderAdmission.mockResolvedValue({
      allowed: false,
      reason: 'provider_rate_limit',
      retryAfterSec: 30,
    });
    const service = createEmbeddingService('user-1');

    await expect(service.embedImage('https://blob.example/cat.jpg'))
      .rejects.toBeInstanceOf(EmbeddingProviderCircuitOpenError);
    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.refundEmbeddingAdmissionCapacity).toHaveBeenCalledWith(
      { id: 'lease-1', userId: 'user-1', windowId: 1 },
      { dateKey: '2026-07-14' },
    );
    expect(mocks.recordEmbeddingAdmissionFailure).not.toHaveBeenCalled();
    expect(mocks.recordEmbeddingProviderFailure).not.toHaveBeenCalled();
  });

  it('refunds every quota reservation when concurrent callers lose a circuit race', async () => {
    mocks.acquireEmbeddingAdmissionReservation
      .mockResolvedValueOnce({
        allowed: true,
        reservation: {
          lease: { id: 'lease-a', userId: 'user-1', windowId: 1 },
          dailyReservation: { dateKey: '2026-07-14' },
          counts: { userWindow: 1, globalWindow: 1, dailyBudget: 1 },
        },
      })
      .mockResolvedValueOnce({
        allowed: true,
        reservation: {
          lease: { id: 'lease-b', userId: 'user-1', windowId: 1 },
          dailyReservation: { dateKey: '2026-07-14' },
          counts: { userWindow: 2, globalWindow: 2, dailyBudget: 2 },
        },
      });
    mocks.acquireEmbeddingProviderAdmission.mockResolvedValue({
      allowed: false,
      reason: 'provider_rate_limit',
      retryAfterSec: 30,
    });
    const service = createEmbeddingService('user-1');

    await Promise.all([
      service.embedImage('https://blob.example/race-a.jpg').catch(() => undefined),
      service.embedImage('https://blob.example/race-b.jpg').catch(() => undefined),
    ]);

    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.refundEmbeddingAdmissionCapacity).toHaveBeenCalledTimes(2);
    expect(mocks.recordEmbeddingProviderFailure).not.toHaveBeenCalled();
  });

  it('classifies an actual provider 429 separately and records the shared circuit failure', async () => {
    mocks.replicateRun.mockRejectedValue({ status: 429, retryAfterSec: 17 });
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('provider throttled'))
      .rejects.toMatchObject({
        name: 'EmbeddingProviderRateLimitError',
        statusCode: 429,
        retryAfterSec: 17,
      } satisfies Partial<EmbeddingProviderRateLimitError>);
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledWith(
      { generation: 0, probeGeneration: null, probeLeaseToken: null },
      'provider_rate_limit',
      17
    );
    expect(mocks.recordEmbeddingAdmissionFailure).not.toHaveBeenCalled();
  });

  it('reads the Replicate ApiError response envelope for provider 429s', async () => {
    const response = new Response(null, {
      status: 429,
      headers: { 'Retry-After': '19' },
    });
    mocks.replicateRun.mockRejectedValue(
      new InstalledReplicateApiError(
        'Request was throttled',
        new Request('https://api.replicate.com/v1/predictions'),
        response,
      ),
    );
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('replicate response envelope')).rejects.toMatchObject({
      name: 'EmbeddingProviderRateLimitError',
      statusCode: 429,
      retryAfterSec: 19,
    });
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledWith(
      { generation: 0, probeGeneration: null, probeLeaseToken: null },
      'provider_rate_limit',
      19,
    );
  });

  it('preserves bounded Retry-After metadata for provider 5xx responses', async () => {
    const response = new Response(null, {
      status: 503,
      headers: { 'Retry-After': '47' },
    });
    mocks.replicateRun.mockRejectedValue(
      new InstalledReplicateApiError(
        'Provider unavailable',
        new Request('https://api.replicate.com/v1/predictions'),
        response,
      ),
    );
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('replicate 5xx response envelope')).rejects.toMatchObject({
      name: 'EmbeddingProviderUnavailableError',
      statusCode: 503,
      retryAfterSec: 47,
    });
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledWith(
      { generation: 0, probeGeneration: null, probeLeaseToken: null },
      'provider_unavailable',
      47,
    );
  });

  it.each([
    ['missing output', undefined],
    ['empty output', []],
    ['wrong dimension', new Array(EMBEDDING_DIMENSION - 1).fill(0.1)],
    ['non-numeric output', [NaN]],
  ])('treats %s as a leased provider failure', async (_label, output) => {
    mocks.replicateRun.mockResolvedValue(output);
    const service = createEmbeddingService('user-1');

    await expect(service.embedImage('https://blob.example/bad.jpg'))
      .rejects.toMatchObject({
        name: 'EmbeddingProviderUnavailableError',
        statusCode: 503,
        retryAfterSec: 30,
      } satisfies Partial<EmbeddingProviderUnavailableError>);
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledOnce();
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledWith(
      { generation: 0, probeGeneration: null, probeLeaseToken: null },
      'provider_unavailable',
      30,
    );
  });

  it.each([undefined, null, 'bad', 0, -1, Infinity])(
    'uses a finite default for malformed provider 429 retry metadata: %s',
    async (retryAfterSec) => {
      mocks.replicateRun.mockRejectedValue({ status: 429, retryAfterSec });
      const service = createEmbeddingService('user-1');

      await expect(service.embedText('provider metadata')).rejects.toMatchObject({
        name: 'EmbeddingProviderRateLimitError',
        statusCode: 429,
        retryAfterSec: 30,
      });
    },
  );

  it('caps provider Retry-After metadata at the documented finite maximum', async () => {
    mocks.replicateRun.mockRejectedValue({ status: 429, retryAfterSec: 999_999 });
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('provider cap')).rejects.toMatchObject({
      name: 'EmbeddingProviderRateLimitError',
      statusCode: 429,
      retryAfterSec: 86_400,
    });
  });

  it('does not spend admission capacity on a durable cache hit', async () => {
    mocks.getTextEmbedding.mockResolvedValue([0.4, 0.5, 0.6]);
    const service = createEmbeddingService('user-1');

    await expect(service.embedText('cached query')).resolves.toMatchObject({
      embedding: [0.4, 0.5, 0.6],
    });

    expect(mocks.acquireEmbeddingAdmissionReservation).not.toHaveBeenCalled();
    expect(mocks.replicateRun).not.toHaveBeenCalled();
    expect(mocks.releaseEmbeddingRateLimit).not.toHaveBeenCalled();
    expect(mocks.recordEmbeddingProviderSuccess).not.toHaveBeenCalled();
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
      name: 'EmbeddingProviderUnavailableError',
      statusCode: 503,
      retryable: true,
    } satisfies Partial<EmbeddingProviderUnavailableError>);

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
    expect(mocks.acquireEmbeddingAdmissionReservation).toHaveBeenCalledOnce();
    expect(mocks.releaseEmbeddingRateLimit).toHaveBeenCalledOnce();
    expect(mocks.recordEmbeddingProviderFailure).toHaveBeenCalledWith(
      { generation: 0, probeGeneration: null, probeLeaseToken: null },
      'provider_unavailable',
      30
    );
  });
});
