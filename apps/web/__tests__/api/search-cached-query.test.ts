import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'qa-design-user',
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  setSearchResults: vi.fn(),
  getTextEmbedding: vi.fn(),
  findManyAssetTags: vi.fn(),
  vectorSearch: vi.fn(),
  logSearch: vi.fn(),
}));

// POST /api/search now resolves auth through withAuthenticatedApi (sploot-071:
// opted into allowUploadToken so a personal API token can drive search), not
// getAuthWithUser directly — see search-upload-token-opt-in.test.ts for the
// wiring proof.
vi.mock('@/lib/auth/with-authenticated-api', () => ({
  withAuthenticatedApi: (handler: any) => async (req: any, context: any = {}) => {
    if (!mocks.authenticatedUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    return handler(req, context, {
      principal: { userId: mocks.authenticatedUserId },
      auth: { status: 'authenticated' },
    });
  },
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
import { EmbeddingError } from '@/lib/embeddings';

function searchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3001/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function boundaryBody(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await response.json())) as Record<string, unknown>;
}

describe('/api/search with a cached query embedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'qa-design-user';
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.setSearchResults.mockResolvedValue(undefined);
    mocks.findManyAssetTags.mockResolvedValue([]);
    mocks.logSearch.mockResolvedValue(undefined);
  });

  it.each([
    { query: 'cat', extra: true },
    { query: 'cat', limit: '10' },
    { query: 'cat', shuffleSeed: 1_000_001 },
  ])('rejects unknown and coercible search inputs: %o', async (body) => {
    const response = await search(searchRequest(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_search_parameter' });
  });

  it.each([
    [{ query: 'bad', limit: '10' }, 'limit'],
    [{ query: 'bad', limit: 0 }, 'limit'],
    [{ query: 'bad', limit: 101 }, 'limit'],
    [{ query: 'bad', limit: Number.NaN }, 'limit'],
    [{ query: 'bad', threshold: -0.01 }, 'threshold'],
    [{ query: 'bad', threshold: 1.01 }, 'threshold'],
    [{ query: 'bad', threshold: '0.5' }, 'threshold'],
    [{ query: 'bad', threshold: Number.NaN }, 'threshold'],
  ])('rejects malformed %s with a typed 400', async (body, field) => {
    const response = await search(searchRequest(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'invalid_search_parameter',
      details: { field },
    });
  });

  it('normalizes a cached result at the JSON boundary without querying embeddings', async () => {
    mocks.getSearchResults.mockResolvedValue([{
      id: 'cached-asset',
      blobUrl: 'https://sploot-qa-seed.public.blob.vercel-storage.com/cached.png',
      thumbnailUrl: 'https://sploot-qa-seed.public.blob.vercel-storage.com/cached-thumb.png',
      similarity: 0.88,
      relevance: 88,
      belowThreshold: false,
    }]);

    const res = await search(searchRequest({ query: 'cached result' }));
    const body = await boundaryBody(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'limit', 'processingTime', 'query', 'requestedLimit', 'requestedThreshold',
      'results', 'threshold', 'thresholdFallback', 'total',
    ]);
    expect(body.results).toEqual([{
      id: 'cached-asset',
      blobUrl: 'https://sploot-qa-seed.public.blob.vercel-storage.com/cached.png',
      thumbnailUrl: 'https://sploot-qa-seed.public.blob.vercel-storage.com/cached-thumb.png',
      similarity: 0.88,
      relevance: 88,
      belowThreshold: false,
    }]);
    expect(mocks.getTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });

  it('serves results from the cached embedding without the Replicate service', async () => {
    const cachedEmbedding = new Array(512).fill(0).map((_, i) => (i === 3 ? 1 : 0));
    mocks.getTextEmbedding.mockResolvedValue(cachedEmbedding);
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('Replicate API token not configured');
    });
    mocks.vectorSearch.mockResolvedValue([
      {
        id: 'asset-1',
        blob_url: 'https://sploot-qa-seed.public.blob.vercel-storage.com/a.png',
        thumbnail_url: null,
        pathname: 'qa/a.png',
        mime: 'image/png',
        width: 800,
        height: 800,
        favorite: false,
        size: 1234,
        created_at: new Date().toISOString(),
        distance: 0.91,
      },
    ]);

    const res = await search(searchRequest({ query: 'reaction face meme' }));
    const body = await boundaryBody(res);

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'limit', 'processingTime', 'query', 'requestedLimit',
      'requestedThreshold', 'results', 'threshold', 'thresholdFallback', 'total',
    ]);
    expect(body).toEqual({
      cached: false,
      limit: 30,
      processingTime: expect.any(Number),
      query: 'reaction face meme',
      requestedLimit: 30,
      requestedThreshold: 0.12,
      results: [{
        id: 'asset-1',
        blobUrl: 'https://sploot-qa-seed.public.blob.vercel-storage.com/a.png',
        thumbnailUrl: null,
        similarity: 0.91,
        relevance: 91,
      }],
      threshold: 0.12,
      thresholdFallback: false,
      total: 1,
    });
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      'qa-design-user',
      cachedEmbedding,
      expect.objectContaining({ limit: 30 })
    );
    expect(mocks.createEmbeddingService).not.toHaveBeenCalled();
  });

  it('rejects an incomplete cached DTO and rehydrates the public result', async () => {
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.getTextEmbedding.mockResolvedValue([1, 0, 0]);
    mocks.vectorSearch.mockResolvedValue([{
      id: 'rehydrated',
      blob_url: 'https://blob.test/rehydrated.png',
      thumbnail_url: null,
      pathname: 'qa/rehydrated.png',
      mime: 'image/png',
      width: 1,
      height: 1,
      favorite: false,
      size: 1,
      created_at: new Date('2026-07-14T12:00:00.000Z'),
      distance: 0.7,
    }]);

    const response = await search(searchRequest({ query: 'stale cache' }));
    const body = await boundaryBody(response);
    expect(response.status).toBe(200);
    expect(body.results).toEqual([expect.objectContaining({ id: 'rehydrated', thumbnailUrl: null })]);
    expect(mocks.vectorSearch).toHaveBeenCalled();
  });

  it('still reports 503 for uncached queries when the service is unconfigured', async () => {
    mocks.getTextEmbedding.mockResolvedValue(null);
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('Replicate API token not configured');
    });

    const res = await search(searchRequest({ query: 'query nobody cached' }));
    expect(res.status).toBe(503);
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });

  it('maps provider errors without returning provider error.message', async () => {
    mocks.getTextEmbedding.mockResolvedValue(null);
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockRejectedValue(new EmbeddingError('provider secret', 500)),
    });

    const res = await search(searchRequest({ query: 'provider poison' }));
    const body = await boundaryBody(res);
    expect(res.status).toBe(500);
    expect(body).toMatchObject({ code: 'server_error', error: 'Search is temporarily unavailable.' });
    expect(body.error).not.toContain('provider secret');
  });
});
