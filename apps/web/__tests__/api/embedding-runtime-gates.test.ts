import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getAuthWithUser: vi.fn(),
  authenticatedUserId: 'user-1',
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  setSearchResults: vi.fn(),
  getTextEmbedding: vi.fn(),
  findFirst: vi.fn(),
  findManyAssetTags: vi.fn(),
  vectorSearch: vi.fn(),
  logSearch: vi.fn(),
  userFindUnique: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuth: mocks.getAuth,
  getAuthWithUser: mocks.getAuthWithUser,
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

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
    user: { findUnique: mocks.userFindUnique },
    asset: {
      findFirst: mocks.findFirst,
    },
    assetTag: {
      findMany: mocks.findManyAssetTags,
    },
  },
  vectorSearch: mocks.vectorSearch,
  logSearch: mocks.logSearch,
  upsertAssetEmbedding: vi.fn(),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { POST as search } from '@/app/api/search/route';
import { POST as advancedSearch } from '@/app/api/search/advanced/route';
import { POST as embedText } from '@/app/api/embeddings/text/route';
import { POST as embedImage } from '@/app/api/embeddings/image/route';

function jsonRequest(pathname: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('embedding runtime gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'false');
    mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getAuthWithUser.mockResolvedValue({ userId: 'user-1' });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    mocks.authenticatedUserId = 'user-1';
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
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ id: 'asset-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['POST /api/embeddings/text', () => embedText(jsonRequest('/api/embeddings/text', { query: 'cat' }))],
    ['POST /api/embeddings/image', () => embedImage(jsonRequest('/api/embeddings/image', { imageUrl: 'https://example.com/cat.jpg' }))],
    ['POST /api/search', () => search(jsonRequest('/api/search', { query: 'cat' }))],
    ['POST /api/search/advanced', () => advancedSearch(jsonRequest('/api/search/advanced', { query: 'cat' }))],
  ])('%s returns a typed disabled response before creating the embedding service', async (_name, callRoute) => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: 'Embedding generation is temporarily paused',
      code: 'embeddings_disabled',
      retryable: true,
    });
    expect(mocks.createEmbeddingService).not.toHaveBeenCalled();
  });
});

describe('search degraded-service honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPLOOT_EMBEDDINGS_ENABLED', 'true');
    mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getAuthWithUser.mockResolvedValue({ userId: 'user-1' });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    mocks.authenticatedUserId = 'user-1';
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.logSearch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/search returns 503, not 200 + empty results, when the embedding service cannot initialize', async () => {
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    });

    const response = await search(jsonRequest('/api/search', { query: 'cat' }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/unavailable/i);
    expect(body.results).toBeUndefined();
  });

  it('POST /api/search does not pad below-threshold misses with threshold-zero fallback results', async () => {
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        model: 'test-embedding-model',
      }),
    });
    mocks.vectorSearch.mockResolvedValue([]);

    const response = await search(jsonRequest('/api/search', {
      query: 'impossible tiny hat query',
      limit: 5,
      threshold: 0.9,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      results: [],
      total: 0,
      limit: 5,
      requestedLimit: 5,
      threshold: 0.9,
      thresholdFallback: false,
    });
    expect(mocks.vectorSearch).toHaveBeenCalledTimes(1);
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      'user-1',
      [0.1, 0.2, 0.3],
      { limit: 5, threshold: 0.9, shuffleSeed: undefined }
    );
  });
});
