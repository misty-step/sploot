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
  decodeVectorSearchCursor: vi.fn(),
  createVectorSearchContext: vi.fn(),
  vectorSearchCursorMatchesContext: vi.fn(),
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
  decodeVectorSearchCursor: mocks.decodeVectorSearchCursor,
  createVectorSearchContext: mocks.createVectorSearchContext,
  vectorSearchCursorMatchesContext: mocks.vectorSearchCursorMatchesContext,
  VECTOR_SEARCH_CURSOR_CONTEXT_ERROR: 'Search cursor does not match search context',
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
    mocks.createVectorSearchContext.mockImplementation((context: unknown) => context);
    mocks.vectorSearchCursorMatchesContext.mockReturnValue(true);
    mocks.decodeVectorSearchCursor.mockReturnValue(null);
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
    expect(mocks.findManyAssetTags).toHaveBeenCalledTimes(1);
    expect(mocks.findManyAssetTags).toHaveBeenCalledWith({
      where: { assetId: { in: ['asset-1'] } },
      select: {
        assetId: true,
        tag: { select: { id: true, name: true } },
      },
    });
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

  it('forwards favorite and tag filters as part of the server-side search contract', async () => {
    mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0.1));
    mocks.vectorSearchPage.mockResolvedValue({ results: [], total: 0, hasMore: false });

    const response = await search(searchRequest({
      query: 'cats',
      favoriteOnly: true,
      tagId: 'tag-cats',
    }));

    expect(response.status).toBe(200);
    expect(mocks.vectorSearchPage).toHaveBeenCalledWith(
      'qa-design-user',
      expect.any(Array),
      expect.objectContaining({ favoriteOnly: true, tagId: 'tag-cats' }),
    );
  });

  it('keeps semantic ordering relevance-first even when a gallery seed is supplied', async () => {
    mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0.1));
    mocks.vectorSearchPage.mockResolvedValue({ results: [], total: 0, hasMore: false });

    const response = await search(searchRequest({ query: 'cats', shuffleSeed: 4242 }));

    expect(response.status).toBe(200);
    expect(mocks.vectorSearchPage).toHaveBeenCalledWith(
      'qa-design-user',
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.vectorSearchPage.mock.calls[0][2]).not.toHaveProperty('shuffleSeed');
    expect(mocks.getSearchResultPage).toHaveBeenCalledWith(
      'qa-design-user',
      'cats',
      expect.objectContaining({ sort: 'relevance', direction: 'desc' }),
      'test/clip:model',
    );
  });

  it('rejects unbounded pages and legacy offsets beyond the bounded window', async () => {
    mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0.1));

    const tooLarge = await search(searchRequest({ query: 'cats', limit: 101 }));
    expect(tooLarge.status).toBe(400);

    const tooFar = await search(searchRequest({ query: 'cats', offset: 501 }));
    expect(tooFar.status).toBe(400);
    expect(mocks.vectorSearchPage).not.toHaveBeenCalled();
  });

  it.each([
    ['query', { query: 'dogs', cursor: 'cursor-from-cats' }],
    ['threshold', { query: 'cats', threshold: 0.9, cursor: 'cursor-from-cats' }],
    ['favorite filter', { query: 'cats', favoriteOnly: true, cursor: 'cursor-from-cats' }],
    ['tag filter', { query: 'cats', tagId: 'tag-dogs', cursor: 'cursor-from-cats' }],
    ['page size', { query: 'cats', limit: 10, cursor: 'cursor-from-cats' }],
  ])('rejects a cursor replay with a changed %s before embedding or DB execution', async (_change, body) => {
    mocks.decodeVectorSearchCursor.mockReturnValue({
      version: 4,
      userId: 'qa-design-user',
      order: 'relevance',
      id: 'asset-1',
      rawDistance: '0.1',
      context: { query: 'cats', embeddingModel: 'default', threshold: 0.2, sort: 'relevance', direction: 'desc', favoriteOnly: false, tagId: null, limit: 30 },
    });
    mocks.vectorSearchCursorMatchesContext.mockReturnValue(false);
    mocks.getTextEmbedding.mockResolvedValue(new Array(512).fill(0.1));

    const response = await search(searchRequest(body));
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toEqual({ error: 'Search cursor does not match search context' });
    expect(mocks.getSearchResultPage).not.toHaveBeenCalled();
    expect(mocks.getTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.vectorSearchPage).not.toHaveBeenCalled();
  });
});
