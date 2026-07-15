import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { EmbeddingProviderUnavailableError } from '@/lib/embedding-errors';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  authenticateRequest: vi.fn(),
  findAsset: vi.fn(),
  userFindUnique: vi.fn(),
  upsertAssetEmbedding: vi.fn(),
  createEmbeddingService: vi.fn(),
  acquireEmbeddingProcessing: vi.fn(),
  resolveEmbeddingGateState: vi.fn(),
  deferEmbeddingAdmission: vi.fn(),
  deferEmbeddingProviderInitialization: vi.fn(),
  recordEmbeddingAttemptFailure: vi.fn(),
  wrapperLogInfo: vi.fn(),
  wrapperLogTiming: vi.fn(),
  wrapperLogError: vi.fn(),
  reportCanaryError: vi.fn(() => Promise.resolve()),
  withTraceId: vi.fn(),
  measureAsync: vi.fn(async (_operation: string, run: () => Promise<unknown>) => run()),
  nanoid: vi.fn(() => 'trace-test'),
}));

vi.mock('@/lib/auth/server', () => ({ getAuth: mocks.getAuth }));
vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    asset: { findFirst: mocks.findAsset },
    assetEmbedding: { findUnique: vi.fn() },
  },
  upsertAssetEmbedding: mocks.upsertAssetEmbedding,
}));

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: mocks.createEmbeddingService,
  EmbeddingError: class EmbeddingError extends Error {
    constructor(
      message: string,
      public statusCode?: number
    ) {
      super(message);
    }
  },
  EmbeddingAdmissionError: class EmbeddingAdmissionError extends Error {
    name = 'EmbeddingAdmissionError';
    statusCode: number;
    retryable = true;

    constructor(
      public reason: string,
      public retryAfterSec?: number
    ) {
      super('Embedding generation is rate limited');
      this.statusCode = reason === 'limiter_unavailable' ? 503 : 429;
    }
  },
}));

vi.mock('@/lib/embedding-guard', () => ({
  resolveEmbeddingGateState: mocks.resolveEmbeddingGateState,
  acquireEmbeddingProcessing: mocks.acquireEmbeddingProcessing,
}));

vi.mock('@/lib/embedding-resilience', () => ({
  getEmbeddingProviderCircuit: vi.fn().mockResolvedValue({ available: true, open: false }),
  isEmbeddingAdmissionFailure: () => false,
  getEmbeddingAdmissionReason: () => undefined,
  deferEmbeddingAdmission: mocks.deferEmbeddingAdmission,
  deferEmbeddingProviderInitialization: mocks.deferEmbeddingProviderInitialization,
  recordEmbeddingAttemptFailure: mocks.recordEmbeddingAttemptFailure,
}));

vi.mock('@/lib/sse-broadcaster', () => ({
  broadcastEmbeddingUpdate: vi.fn(),
}));

vi.mock('@/lib/performance-monitor', () => ({
  getPerformanceMonitor: vi.fn(() => ({ measureAsync: mocks.measureAsync })),
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

vi.mock('@/lib/observability-logger', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability-logger')>(
    '@/lib/observability-logger'
  );
  return {
    ...actual,
    withTraceId: mocks.withTraceId,
  };
});

vi.mock('@/lib/canary-reporter', () => ({
  reportCanaryError: mocks.reportCanaryError,
}));

import { POST } from '@/app/api/assets/[id]/generate-embedding/route';
import { logger as routeLogger } from '@/lib/observability-logger';

function request(assetId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/assets/${assetId}/generate-embedding`,
    { method: 'POST' }
  );
}

describe('POST /api/assets/[id]/generate-embedding observability composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(routeLogger, 'logInfo');
    vi.spyOn(routeLogger, 'logError');
    mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: {
        userId: 'user-1',
        provider: 'qa-local',
        providerSubject: 'user-1',
        source: 'qa-local',
        credentialKind: 'qa-local',
      },
      syncStatus: 'success',
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    mocks.findAsset.mockResolvedValue({
      id: 'asset-1',
      blobUrl: 'https://blob.example/image.jpg',
      checksumSha256: 'sha-256',
      mime: 'image/jpeg',
      thumbnailUrl: null,
      embedding: null,
    });
    mocks.acquireEmbeddingProcessing.mockResolvedValue({
      acquired: true,
      state: 'processing',
      processingClaimToken: 'claim-1',
    });
    mocks.resolveEmbeddingGateState.mockReturnValue({ state: 'available' });
    mocks.createEmbeddingService.mockReturnValue({
      embedImage: vi.fn().mockRejectedValue(new Error('unexpected provider shape')),
    });
    mocks.deferEmbeddingProviderInitialization.mockResolvedValue(true);
    mocks.withTraceId.mockReturnValue({
      logInfo: mocks.wrapperLogInfo,
      logTiming: mocks.wrapperLogTiming,
      logError: mocks.wrapperLogError,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits exactly one Canary report for a generic failure across route and wrapper', async () => {
    const response = await POST(request('asset-generic-failure'), {
      params: Promise.resolve({ id: 'asset-generic-failure' }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('X-Sploot-Canary-Owner')).toBe('route');
    await vi.waitFor(() => expect(mocks.reportCanaryError).toHaveBeenCalledTimes(1));
    expect(routeLogger.logError).toHaveBeenCalledWith(
      'generate-embedding:failed',
      expect.any(Error),
      expect.objectContaining({ processingTimeMs: expect.any(Number) }),
    );
    expect(routeLogger.logInfo).not.toHaveBeenCalledWith(
      'generate-embedding:failed',
      expect.anything(),
      expect.anything(),
    );
    expect(mocks.wrapperLogError).not.toHaveBeenCalledWith(
      'request:server-error-status',
      expect.anything(),
      expect.anything(),
    );
  });

  it('defers missing provider configuration without consuming an attempt, then recovers', async () => {
    let initializationCount = 0;
    mocks.createEmbeddingService.mockImplementation(() => {
      initializationCount += 1;
      if (initializationCount === 1) {
        throw new EmbeddingProviderUnavailableError('Replicate API token not configured');
      }
      return {
        embedImage: vi.fn().mockResolvedValue({
          model: 'test-model',
          dimension: 768,
          embedding: new Array(768).fill(0.1),
          processingTime: 1,
        }),
      };
    });
    mocks.upsertAssetEmbedding.mockResolvedValue({
      modelName: 'test-model', dim: 768, createdAt: new Date(),
    });

    const first = await POST(request('asset-init-failure'), {
      params: Promise.resolve({ id: 'asset-init-failure' }),
    });
    expect(first.status).toBe(503);
    expect(mocks.deferEmbeddingProviderInitialization).toHaveBeenCalledWith(
      'asset-1',
      'Replicate API token not configured',
      30,
      'claim-1',
    );
    expect(mocks.recordEmbeddingAttemptFailure).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 120));
    const second = await POST(request('asset-init-recovery'), {
      params: Promise.resolve({ id: 'asset-init-recovery' }),
    });
    expect(second.status).toBe(200);
    expect(mocks.recordEmbeddingAttemptFailure).not.toHaveBeenCalled();
  });
});
