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
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.setSearchResults.mockResolvedValue(undefined);
    mocks.findManyAssetTags.mockResolvedValue([]);
    mocks.logSearch.mockResolvedValue(undefined);
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
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe('asset-1');
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
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
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });
});
