import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  findAsset: vi.fn(),
  upsertAssetEmbedding: vi.fn(),
  createEmbeddingService: vi.fn(),
  acquireEmbeddingProcessing: vi.fn(),
  markEmbeddingFailed: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  userFindUnique: vi.fn(),
  authenticateRequest: vi.fn(),
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
  resolveEmbeddingGateState: vi.fn(() => ({ state: 'available' })),
  acquireEmbeddingProcessing: mocks.acquireEmbeddingProcessing,
  markEmbeddingFailed: mocks.markEmbeddingFailed,
}));

vi.mock('@/lib/sse-broadcaster', () => ({
  broadcastEmbeddingUpdate: vi.fn(),
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: {
    logInfo: mocks.logInfo,
    logError: mocks.logError,
  },
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

import { POST } from '@/app/api/assets/[id]/generate-embedding/route';
import { EmbeddingAdmissionError } from '@/lib/embeddings';

function request(assetId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/assets/${assetId}/generate-embedding`,
    { method: 'POST' }
  );
}

describe('POST /api/assets/[id]/generate-embedding daily budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      embedding: null,
    });
    mocks.acquireEmbeddingProcessing.mockResolvedValue({
      acquired: true,
      state: 'processing',
    });
    mocks.createEmbeddingService.mockReturnValue({
      embedImage: vi
        .fn()
        .mockRejectedValue(new EmbeddingAdmissionError('daily_budget', 3600)),
    });
    mocks.upsertAssetEmbedding.mockResolvedValue({
      modelName: 'test/model',
      dim: 3,
      createdAt: new Date('2026-07-10T00:00:00Z'),
    });
  });

  it('refuses paid work and releases its lease when the daily budget is exhausted', async () => {
    const response = await POST(request('asset-1'), {
      params: Promise.resolve({ id: 'asset-1' }),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      status: 'rate_limited',
      reason: 'daily_budget',
      retryAfter: 3600,
    });
    expect(mocks.acquireEmbeddingProcessing).toHaveBeenCalledOnce();
    expect(mocks.createEmbeddingService).toHaveBeenCalledWith('user-1');
    expect(mocks.markEmbeddingFailed).toHaveBeenCalledWith(
      'asset-1',
      'Embedding generation is rate limited'
    );
  });
});
