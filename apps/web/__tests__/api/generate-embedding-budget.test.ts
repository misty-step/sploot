import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  findAsset: vi.fn(),
  upsertAssetEmbedding: vi.fn(),
  createEmbeddingService: vi.fn(),
  acquireEmbeddingProcessing: vi.fn(),
  resolveEmbeddingGateState: vi.fn(),
  markEmbeddingFailed: vi.fn(),
  markEmbeddingTerminalSkipped: vi.fn(),
  deferEmbeddingAdmission: vi.fn(),
  getEmbeddingProviderCircuit: vi.fn(),
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
  resolveEmbeddingGateState: mocks.resolveEmbeddingGateState,
  acquireEmbeddingProcessing: mocks.acquireEmbeddingProcessing,
  markEmbeddingFailed: mocks.markEmbeddingFailed,
  markEmbeddingTerminalSkipped: mocks.markEmbeddingTerminalSkipped,
}));

vi.mock('@/lib/embedding-resilience', () => ({
  getEmbeddingProviderCircuit: mocks.getEmbeddingProviderCircuit,
  isEmbeddingAdmissionFailure: (error: unknown) => error instanceof Error && error.name === 'EmbeddingAdmissionError',
  getEmbeddingAdmissionReason: (error: { reason: string }) => error.reason,
  deferEmbeddingAdmission: mocks.deferEmbeddingAdmission,
  recordEmbeddingAttemptFailure: vi.fn(),
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

const PROCESSING_CLAIM_TOKEN = 'generate-route-processing-claim';

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
      mime: 'image/jpeg',
      thumbnailUrl: null,
      embedding: null,
    });
    mocks.acquireEmbeddingProcessing.mockResolvedValue({
      acquired: true,
      state: 'processing',
      processingClaimToken: PROCESSING_CLAIM_TOKEN,
    });
    mocks.resolveEmbeddingGateState.mockReturnValue({ state: 'available' });
    mocks.getEmbeddingProviderCircuit.mockResolvedValue({ available: true, open: false });
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
    expect(mocks.deferEmbeddingAdmission).toHaveBeenCalledWith(
      'asset-1',
      'Embedding generation is rate limited',
      'daily_budget',
      3600,
      PROCESSING_CLAIM_TOKEN,
    );
    expect(mocks.markEmbeddingFailed).not.toHaveBeenCalled();
  });

  it('leaves generic 5xx Canary ownership to observability', async () => {
    mocks.createEmbeddingService.mockReturnValue({
      embedImage: vi.fn().mockRejectedValue(new Error('unexpected provider shape')),
    });

    const response = await POST(request('asset-generic-failure'), {
      params: Promise.resolve({ id: 'asset-generic-failure' }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('X-Sploot-Canary-Owner')).toBeNull();
    expect(mocks.logError).toHaveBeenCalledWith(
      'generate-embedding:failed',
      expect.any(Error),
      expect.objectContaining({ processingTimeMs: expect.any(Number) }),
    );
  });

  it('terminal-skips unsupported video without a poster before admission', async () => {
    mocks.findAsset.mockResolvedValue({
      id: 'asset-video',
      blobUrl: 'https://blob.example/raw.webm',
      checksumSha256: 'sha-256-video',
      mime: 'video/webm',
      thumbnailUrl: null,
      embedding: null,
    });

    const response = await POST(request('asset-video'), {
      params: Promise.resolve({ id: 'asset-video' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      status: 'terminal_skip',
      reason: 'video_without_poster',
    });
    expect(mocks.acquireEmbeddingProcessing).not.toHaveBeenCalled();
    expect(mocks.createEmbeddingService).not.toHaveBeenCalled();
    expect(mocks.getEmbeddingProviderCircuit).not.toHaveBeenCalled();
    expect(mocks.markEmbeddingTerminalSkipped).toHaveBeenCalledWith(
      'asset-video',
      'Unsupported video without a poster thumbnail'
    );
  });

  it('does not read the provider circuit for ready, processing, or cooldown work', async () => {
    for (const state of ['ready', 'processing', 'cooldown'] as const) {
      vi.clearAllMocks();
      mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
      mocks.authenticateRequest.mockResolvedValue({
        status: 'authenticated',
        principal: { userId: 'user-1' },
        syncStatus: 'success',
      });
      mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
      mocks.findAsset.mockResolvedValue({
        id: `asset-${state}`,
        blobUrl: 'https://blob.example/image.jpg',
        checksumSha256: 'sha-256',
        mime: 'image/jpeg',
        thumbnailUrl: null,
        embedding: state === 'ready' ? { dim: 768 } : null,
      });
      mocks.resolveEmbeddingGateState.mockReturnValue({ state, retryAfterMs: 30_000 });

      await POST(request(`asset-${state}`), {
        params: Promise.resolve({ id: `asset-${state}` }),
      });

      expect(mocks.getEmbeddingProviderCircuit).not.toHaveBeenCalled();
      expect(mocks.createEmbeddingService).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['missing', undefined, '30'],
    ['malformed', Number.NaN, '30'],
    ['negative', -20, '1'],
    ['long', 999999000, '999999'],
  ])('normalizes %s manual cooldown Retry-After metadata', async (_label, retryAfterMs, expected) => {
    mocks.resolveEmbeddingGateState.mockReturnValue({
      state: 'cooldown',
      retryAfterMs,
    });

    const response = await POST(request(`asset-${_label}`), {
      params: Promise.resolve({ id: `asset-${_label}` }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe(expected);
  });
});
