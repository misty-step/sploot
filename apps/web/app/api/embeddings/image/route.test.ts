import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthenticatedApiHandler } from '@/lib/auth/with-authenticated-api';
import type { RouteHandler } from '@/lib/with-observability';
import { EmbeddingConfigurationError, EmbeddingProviderUnavailableError } from '@/lib/embedding-errors';

const testPrincipal = {
  userId: 'user-1',
  provider: 'qa-local' as const,
  providerSubject: 'user-1',
  source: 'qa-local' as const,
  credentialKind: 'qa-local' as const,
};
const testAuthContext = {
  principal: testPrincipal,
  auth: {
    status: 'authenticated' as const,
    principal: testPrincipal,
    syncStatus: 'success' as const,
  },
};

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createEmbeddingService: vi.fn(),
  embedImage: vi.fn(),
  upsertAssetEmbedding: vi.fn(),
  acquireEmbeddingProcessing: vi.fn(),
  resolveEmbeddingGateState: vi.fn(),
  markEmbeddingTerminalSkipped: vi.fn(),
  reviveTerminalEmbedding: vi.fn(),
  getEmbeddingProviderCircuit: vi.fn(),
  deferEmbeddingAdmission: vi.fn(),
  recordEmbeddingConfigurationFailure: vi.fn(),
  recordEmbeddingAttemptFailure: vi.fn(),
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: AuthenticatedApiHandler) => (request: NextRequest) =>
    handler(request, { params: Promise.resolve({}) }, testAuthContext),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: RouteHandler) => handler,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: { findFirst: mocks.findFirst },
  },
  upsertAssetEmbedding: mocks.upsertAssetEmbedding,
}));

vi.mock('@/lib/enrollment/enrollment-policy', () => ({
  assertEnrolledUser: vi.fn(),
  enrollmentDeniedResponse: () => Response.json({}, { status: 403 }),
  enrollmentUnavailableResponse: () => Response.json({}, { status: 503 }),
  isEnrollmentDeniedError: () => false,
  isEnrollmentUnavailableError: () => false,
}));

vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({ enabled: true }),
  runtimeGateResponse: () => Response.json({}, { status: 503 }),
}));

vi.mock('@/lib/embedding-guard', () => ({
  acquireEmbeddingProcessing: mocks.acquireEmbeddingProcessing,
  markEmbeddingTerminalSkipped: mocks.markEmbeddingTerminalSkipped,
  resolveEmbeddingGateState: mocks.resolveEmbeddingGateState,
}));

vi.mock('@/lib/embedding-resilience', () => ({
  deferEmbeddingAdmission: mocks.deferEmbeddingAdmission,
  recordEmbeddingConfigurationFailure: mocks.recordEmbeddingConfigurationFailure,
  getEmbeddingAdmissionReason: () => undefined,
  getEmbeddingProviderCircuit: mocks.getEmbeddingProviderCircuit,
  isEmbeddingAdmissionFailure: () => false,
  recordEmbeddingAttemptFailure: mocks.recordEmbeddingAttemptFailure,
  reviveTerminalEmbedding: mocks.reviveTerminalEmbedding,
}));

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: mocks.createEmbeddingService,
  EmbeddingAdmissionError: class EmbeddingAdmissionError extends Error {},
  EmbeddingError: class EmbeddingError extends Error {},
}));

vi.mock('@/lib/embedding-errors', () => ({
  embeddingRetryHeaders: () => undefined,
  embeddingRetryAfterHeader: () => undefined,
  EmbeddingProviderCircuitOpenError: class EmbeddingProviderCircuitOpenError extends Error {
    retryAfterSec?: number;
    constructor(retryAfterSec?: number) { super('provider circuit open'); this.retryAfterSec = retryAfterSec; }
  },
  EmbeddingProviderRateLimitError: class EmbeddingProviderRateLimitError extends Error {},
  EmbeddingProviderUnavailableError: class EmbeddingProviderUnavailableError extends Error {
    retryAfterSec?: number;
    statusCode = 503;
    constructor(message: string) { super(message); this.retryAfterSec = 30; }
  },
  EmbeddingConfigurationError: class EmbeddingConfigurationError extends Error {
    statusCode = 503;
    retryable = false;
    reason = 'embedding_configuration';
    constructor(message: string) { super(message); }
  },
}));

import { POST } from '@/app/api/embeddings/image/route';

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/embeddings/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/embeddings/image asset media selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertAssetEmbedding.mockResolvedValue({});
    mocks.createEmbeddingService.mockReturnValue({ embedImage: mocks.embedImage });
    mocks.resolveEmbeddingGateState.mockReturnValue({ state: 'available' });
    mocks.acquireEmbeddingProcessing.mockResolvedValue({ acquired: true, state: 'processing', processingClaimToken: 'claim-1' });
    mocks.reviveTerminalEmbedding.mockResolvedValue({ revived: false, reason: 'not_terminal' });
    mocks.getEmbeddingProviderCircuit.mockResolvedValue({ available: true, open: false });
  });

  it('returns ready without reading the provider circuit or calling the provider', async () => {
    mocks.resolveEmbeddingGateState.mockReturnValue({ state: 'ready' });
    mocks.findFirst.mockResolvedValue({
      id: 'asset-ready',
      blobUrl: 'https://blob.example/image.jpg',
      thumbnailUrl: null,
      mime: 'image/jpeg',
      checksumSha256: 'ready-checksum',
      embedding: {
        modelName: 'test-model', dim: 768, createdAt: new Date(), status: 'ready',
        updatedAt: new Date(), completedAt: new Date(), nextAttemptAt: null, terminalAt: null,
      },
    });

    const response = await POST(request({ assetId: 'asset-ready', imageUrl: 'https://blob.example/image.jpg' }));

    expect(response.status).toBe(200);
    expect(mocks.embedImage).not.toHaveBeenCalled();
    expect(mocks.getEmbeddingProviderCircuit).not.toHaveBeenCalled();
  });

  it('uses the stored video poster instead of the raw asset blob', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'asset-video',
      ownerUserId: 'user-1',
      blobUrl: 'https://blob.example/raw.mp4',
      thumbnailUrl: 'https://blob.example/poster.jpg',
      mime: 'video/mp4',
      checksumSha256: 'video-checksum',
    });
    mocks.embedImage.mockResolvedValue({
      embedding: [0.1],
      model: 'test-model',
      dimension: 1,
      processingTime: 1,
    });

    const response = await POST(
      request({
        assetId: 'asset-video',
        imageUrl: 'https://blob.example/raw.mp4',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.embedImage).toHaveBeenCalledWith(
      'https://blob.example/poster.jpg',
      'video-checksum',
    );
  });

  it('fails closed before provider admission when an asset video has no poster', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'asset-video-no-poster',
      ownerUserId: 'user-1',
      blobUrl: 'https://blob.example/raw.webm',
      thumbnailUrl: null,
      mime: 'video/webm',
      checksumSha256: 'video-checksum',
    });

    const response = await POST(
      request({
        assetId: 'asset-video-no-poster',
        imageUrl: 'https://blob.example/raw.webm',
      }),
    );

    expect(response.status).toBe(422);
    expect(mocks.embedImage).not.toHaveBeenCalled();
  });

  it('does not report success when a concurrent claim rejects the asset write', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'asset-raced',
      ownerUserId: 'user-1',
      blobUrl: 'https://blob.example/image.jpg',
      thumbnailUrl: null,
      mime: 'image/jpeg',
      checksumSha256: 'image-checksum',
    });
    mocks.embedImage.mockResolvedValue({
      embedding: [0.1],
      model: 'test-model',
      dimension: 1,
      processingTime: 1,
    });
    mocks.upsertAssetEmbedding.mockResolvedValue(null);

    const response = await POST(
      request({ assetId: 'asset-raced', imageUrl: 'https://blob.example/image.jpg' }),
    );

    expect(response.status).toBe(409);
    expect(mocks.upsertAssetEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-raced' }),
      'claim-1',
    );
    await expect(response.json()).resolves.toEqual({
      error: 'Embedding state changed; retry the request',
    });
  });

  it('records a provider-call failure against the claimed asset', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'asset-failed', blobUrl: 'https://blob.example/image.jpg', thumbnailUrl: null,
      mime: 'image/jpeg', checksumSha256: 'failure-checksum', embedding: null,
    });
    mocks.embedImage.mockRejectedValue(new Error('provider failed'));

    const response = await POST(request({ assetId: 'asset-failed', imageUrl: 'https://blob.example/image.jpg' }));

    expect(response.status).toBe(500);
    expect(mocks.recordEmbeddingAttemptFailure).toHaveBeenCalledWith('asset-failed', 'provider failed', 'claim-1');
  });

  it('terminally blocks factory initialization without poisoning or retry headers', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'asset-init', blobUrl: 'https://blob.example/image.jpg', thumbnailUrl: null,
      mime: 'image/jpeg', checksumSha256: 'init-checksum', embedding: null,
    });
    mocks.createEmbeddingService.mockImplementationOnce(() => {
      throw new EmbeddingConfigurationError('missing provider token');
    });

    const initResponse = await POST(request({ assetId: 'asset-init', imageUrl: 'https://blob.example/image.jpg' }));
    expect(initResponse.status).toBe(503);
    expect(mocks.recordEmbeddingConfigurationFailure).toHaveBeenCalledWith(
      'asset-init', expect.objectContaining({ reason: 'embedding_configuration', retryable: false }), 'claim-1',
    );
    expect(mocks.recordEmbeddingAttemptFailure).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.resolveEmbeddingGateState.mockReturnValue({ state: 'available' });
    mocks.acquireEmbeddingProcessing.mockResolvedValue({ acquired: true, state: 'processing', processingClaimToken: 'claim-2' });
    mocks.getEmbeddingProviderCircuit.mockResolvedValue({ available: true, open: false });
    mocks.findFirst.mockResolvedValue({
      id: 'asset-call', blobUrl: 'https://blob.example/image.jpg', thumbnailUrl: null,
      mime: 'image/jpeg', checksumSha256: 'call-checksum', embedding: null,
    });
    mocks.embedImage.mockRejectedValue(new EmbeddingProviderUnavailableError('provider call failed'));

    const callResponse = await POST(request({ assetId: 'asset-call', imageUrl: 'https://blob.example/image.jpg' }));
    expect(callResponse.status).toBe(503);
    expect(mocks.recordEmbeddingAttemptFailure).toHaveBeenCalledWith(
      'asset-call', 'provider call failed', 'claim-2',
    );
  });
});
