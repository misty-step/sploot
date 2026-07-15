import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'qa-design-user',
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  getSearchResultPage: vi.fn(),
  setSearchResults: vi.fn(),
  setSearchResultPage: vi.fn(),
  getTextEmbedding: vi.fn(),
  findManyAssetTags: vi.fn(),
  vectorSearchPage: vi.fn(),
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
    getSearchResultPage: mocks.getSearchResultPage,
    setSearchResultPage: mocks.setSearchResultPage,
    getTextEmbedding: mocks.getTextEmbedding,
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'qa-design-user' }),
    },
    assetTag: {
      findMany: mocks.findManyAssetTags,
    },
  },
  vectorSearchPage: mocks.vectorSearchPage,
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

describe('/api/search with a cached query embedding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'qa-design-user';
    mocks.getSearchResultPage.mockResolvedValue(null);
    mocks.setSearchResultPage.mockResolvedValue(undefined);
    mocks.findManyAssetTags.mockResolvedValue([]);
    mocks.logSearch.mockResolvedValue(undefined);
  });

  it('serves results from the cached embedding without the Replicate service', async () => {
    const cachedEmbedding = new Array(512).fill(0).map((_, i) => (i === 3 ? 1 : 0));
    mocks.getTextEmbedding.mockResolvedValue(cachedEmbedding);
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('Replicate API token not configured');
    });
    mocks.vectorSearchPage.mockResolvedValue({ results: [
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
    ], total: 41 });

    const res = await search(searchRequest({ query: 'reaction face meme' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.total).toBe(41);
    expect(body.hasMore).toBe(true);
    expect(body.results[0].id).toBe('asset-1');
    expect(mocks.vectorSearchPage).toHaveBeenCalledWith(
      'qa-design-user',
      cachedEmbedding,
      expect.objectContaining({ limit: 30 })
    );
    expect(mocks.createEmbeddingService).not.toHaveBeenCalled();
  });

  it('still reports 503 for uncached queries when the service is unconfigured', async () => {
    mocks.getTextEmbedding.mockResolvedValue(null);
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('Replicate API token not configured');
    });

    const res = await search(searchRequest({ query: 'query nobody cached' }));
    expect(res.status).toBe(503);
    expect(mocks.vectorSearchPage).not.toHaveBeenCalled();
  });

  it('rejects unbounded pages and legacy offsets beyond the bounded window', async () => {
    mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0.1));

    const tooLarge = await search(searchRequest({ query: 'cats', limit: 101 }));
    expect(tooLarge.status).toBe(400);

    const tooFar = await search(searchRequest({ query: 'cats', offset: 501 }));
    expect(tooFar.status).toBe(400);
    expect(mocks.vectorSearchPage).not.toHaveBeenCalled();
  });
});
