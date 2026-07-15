import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Wiring proof: POST /api/search must opt into upload-token auth so a
 * personal API token can drive the read-side of the token-scoped external
 * contract (sploot-071), not just the upload-only routes. The resolver-level
 * scope test (upload-token-scope.test.ts) proves the gate; this proves the
 * route passes allowUploadToken: true through it, mirroring
 * upload-token-opt-in.test.ts for /api/upload.
 */

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  setSearchResults: vi.fn(),
  getTextEmbedding: vi.fn(),
  findManyAssetTags: vi.fn(),
  vectorSearch: vi.fn(),
  logSearch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));
vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

vi.mock('@/lib/embeddings', () => ({
  CLIP_MODEL: 'test/clip:model',
  createEmbeddingService: mocks.createEmbeddingService,
  EmbeddingError: class EmbeddingError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
    }
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    getSearchResults: mocks.getSearchResults,
    setSearchResults: mocks.setSearchResults,
    getTextEmbedding: mocks.getTextEmbedding,
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'user-token-1' }),
    },
    assetTag: {
      findMany: mocks.findManyAssetTags,
    },
  },
  vectorSearch: mocks.vectorSearch,
  logSearch: mocks.logSearch,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { POST as search } from '@/app/api/search/route';

function searchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3001/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSearchResults.mockResolvedValue(null);
  mocks.setSearchResults.mockResolvedValue(undefined);
  mocks.findManyAssetTags.mockResolvedValue([]);
  mocks.logSearch.mockResolvedValue(undefined);
  mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0).map((_, i) => (i === 3 ? 1 : 0)));
  mocks.vectorSearch.mockResolvedValue([]);
});

describe('POST /api/search opts into upload-token auth', () => {
  it('calls authenticateRequest with { allowUploadToken: true }', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: { userId: 'user-token-1' },
      syncStatus: 'skipped',
    });

    const res = await search(searchRequest({ query: 'reaction face meme' }), {} as any);

    expect(res.status).toBe(200);
    expect(mocks.authenticateRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowUploadToken: true })
    );
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      'user-token-1',
      expect.any(Array),
      expect.objectContaining({ limit: 30 })
    );
  });

  it('returns the stable 401 contract when the token is rejected', async () => {
    mocks.authenticateRequest.mockResolvedValue({
      status: 'unauthenticated',
      reason: 'upload-token-invalid',
    });

    const res = await search(searchRequest({ query: 'reaction face meme' }), {} as any);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });
});
