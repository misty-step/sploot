import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'qa-design-user',
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  setSearchResults: vi.fn(),
  findManyAssetTags: vi.fn(),
  findManyAssets: vi.fn(),
  queryRaw: vi.fn(),
  logSearch: vi.fn(),
}));

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
  createEmbeddingService: mocks.createEmbeddingService,
  EmbeddingAdmissionError: class EmbeddingAdmissionError extends Error {
    constructor(message: string, public statusCode?: number, public code?: string) {
      super(message);
    }
  },
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
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'qa-design-user' }),
    },
    asset: {
      findMany: mocks.findManyAssets,
    },
    assetTag: {
      findMany: mocks.findManyAssetTags,
    },
    $queryRaw: mocks.queryRaw,
  },
  logSearch: mocks.logSearch,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { POST as advancedSearch } from '@/app/api/search/advanced/route';

function searchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3001/api/search/advanced', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/search/advanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'qa-design-user';
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.setSearchResults.mockResolvedValue(undefined);
    mocks.findManyAssetTags.mockResolvedValue([]);
    mocks.logSearch.mockResolvedValue(undefined);
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockResolvedValue({ embedding: new Array(768).fill(0), model: 'test/clip:model' }),
    });
  });

  it('selects thumbnail_url and derives filename from pathname instead of a non-existent column', async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: 'asset-1',
        blob_url: 'https://blob/a.png',
        thumbnail_url: 'https://blob/thumb-a.png',
        pathname: 'memes/deep/a.png',
        mime: 'image/png',
        size: 1234,
        width: 800,
        height: 800,
        favorite: false,
        created_at: new Date('2026-07-01T00:00:00Z'),
        updated_at: new Date('2026-07-01T00:00:00Z'),
        similarity: 0.87,
        total_count: BigInt(1),
      },
    ]);

    const res = await advancedSearch(searchRequest({ query: 'reaction face meme' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    // sploot-049: the raw SQL previously selected a.filename, a column that
    // does not exist on the assets table -- this always threw at runtime.
    // toGridAsset derives the basename from pathname instead.
    expect(body.results[0].filename).toBe('a.png');
    // sploot-048/049: thumbnail_url must be selected and survive to the DTO.
    expect(body.results[0].thumbnailUrl).toBe('https://blob/thumb-a.png');
    expect(body.results[0].similarity).toBeCloseTo(0.87);
    expect(body.results[0].relevance).toBe(87);

    const [sqlObject] = mocks.queryRaw.mock.calls[0];
    const sql = sqlObject.text;
    expect(sql).toContain('a.thumbnail_url');
    expect(sql).not.toContain('a.filename');
  });

  it('falls back to metadata search with thumbnailUrl and a derived filename when the embedding service is unconfigured', async () => {
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('Replicate API token not configured');
    });
    mocks.findManyAssets.mockResolvedValue([
      {
        id: 'asset-2',
        blobUrl: 'https://blob/b.png',
        thumbnailUrl: 'https://blob/thumb-b.png',
        pathname: 'memes/deep/b.png',
        mime: 'image/png',
        size: 2048,
        width: 640,
        height: 480,
        favorite: true,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        tags: [],
      },
    ]);

    const res = await advancedSearch(searchRequest({ query: 'b' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.searchType).toBe('metadata');
    expect(body.results).toHaveLength(1);
    expect(body.results[0].thumbnailUrl).toBe('https://blob/thumb-b.png');
    expect(body.results[0].filename).toBe('b.png');
    expect(body.results[0].similarity).toBe(0);
    expect(body.results[0].relevance).toBe(0);

    // sploot-049: the Prisma `where` clause must query the real `pathname`
    // column -- `filename` does not exist on Asset (schema.prisma) and a
    // permissive mock previously hid a real-runtime Prisma validation error
    // on this exact fallback path.
    expect(mocks.findManyAssets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'qa-design-user',
          deletedAt: null,
          pathname: { contains: 'b', mode: 'insensitive' },
        }),
      }),
    );
    const [findManyArgs] = mocks.findManyAssets.mock.calls[0];
    expect(findManyArgs.where).not.toHaveProperty('filename');
  });
});
