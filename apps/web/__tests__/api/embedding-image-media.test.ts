import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  embedImage: vi.fn(),
}));

vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => (request: NextRequest) =>
    handler(request, {}, {
      principal: { userId: 'user-1' },
    }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: { findFirst: mocks.findFirst },
  },
  upsertAssetEmbedding: vi.fn(),
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

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: () => ({ embedImage: mocks.embedImage }),
  EmbeddingAdmissionError: class EmbeddingAdmissionError extends Error {},
  EmbeddingError: class EmbeddingError extends Error {},
}));

vi.mock('@/lib/embedding-errors', () => ({
  embeddingRetryHeaders: () => undefined,
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
});
