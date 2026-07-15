import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getSearchResults: vi.fn(),
  getSearchResultsPage: vi.fn(),
  setSearchResults: vi.fn(),
  createEmbeddingService: vi.fn(),
  queryRaw: vi.fn(),
  findManyAssets: vi.fn(),
  countAssets: vi.fn(),
  findManyAssetTags: vi.fn(),
  searchLogCreate: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getAuth: mocks.getAuth }));
vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    getSearchResults: mocks.getSearchResults,
    getSearchResultsPage: mocks.getSearchResultsPage,
    setSearchResults: mocks.setSearchResults,
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    asset: { findMany: mocks.findManyAssets, count: mocks.countAssets },
    assetTag: { findMany: mocks.findManyAssetTags },
    searchLog: { create: mocks.searchLogCreate },
  },
}));
vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: mocks.createEmbeddingService,
  EmbeddingError: class EmbeddingError extends Error {
    constructor(message: string, public readonly statusCode?: number) {
      super(message);
    }
  },
}));
vi.mock('@/lib/runtime-gates', () => ({
  getRuntimeGate: () => ({ enabled: true }),
  runtimeGateResponse: vi.fn(),
}));
vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

import { POST } from '@/app/api/search/advanced/route';
import { EmbeddingError } from '@/lib/embeddings';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/search/advanced', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function boundaryBody(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await response.json())) as Record<string, unknown>;
}

function gridAsset(id: string) {
  return {
    id,
    blobUrl: `https://blob.test/${id}.png`,
    thumbnailUrl: `https://blob.test/${id}-thumb.png`,
    similarity: 0.8,
    relevance: 80,
  };
}

function snakeRow(id: string, totalCount: bigint) {
  return {
    id,
    blob_url: `https://blob.test/${id}.png`,
    thumbnail_url: `https://blob.test/${id}-thumb.png`,
    pathname: `memes/${id}.png`,
    mime: 'image/png',
    size: 1024,
    width: 320,
    height: 240,
    favorite: false,
    created_at: new Date('2026-07-14T12:00:00.000Z'),
    updated_at: new Date('2026-07-14T12:01:00.000Z'),
    similarity: 0.91,
    total_count: totalCount,
  };
}

describe('POST /api/search/advanced response envelopes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getSearchResults.mockResolvedValue(null);
    mocks.getSearchResultsPage.mockResolvedValue(null);
    mocks.setSearchResults.mockResolvedValue(undefined);
    mocks.findManyAssets.mockResolvedValue([]);
    mocks.countAssets.mockResolvedValue(0);
    mocks.findManyAssetTags.mockResolvedValue([]);
    mocks.searchLogCreate.mockResolvedValue(undefined);
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockResolvedValue({
        embedding: new Array(768).fill(0),
        model: 'clip-test',
      }),
    });
  });

  it.each([
    [{ query: 'cat', extra: true }],
    [{ query: 'cat', filters: { tags: ['reaction'], extra: true } }],
    [{ query: 'cat', limit: '30' }],
    [{ query: 'cat', sortBy: 'random' }],
    [{ query: 'cat', filters: { minWidth: '320' } }],
  ])('rejects malformed request shapes without coercion: %o', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_search_parameter' });
  });

  it('returns the exact cache envelope', async () => {
    mocks.getSearchResults.mockResolvedValue([gridAsset('cached-1')]);
    mocks.getSearchResultsPage.mockResolvedValue({ results: [gridAsset('cached-1')], total: 42, seed: 7 });

    const response = await POST(request({ query: 'cat' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'error', 'filters', 'pagination', 'processingTime', 'query', 'results', 'searchType', 'seed', 'sortBy',
    ]);
    expect(body).toMatchObject({
      cached: true,
      filters: {},
      pagination: { total: 42, page: 1, limit: 30, offset: 0, hasMore: true },
      seed: 7,
      query: 'cat',
      results: [gridAsset('cached-1')],
      searchType: 'semantic',
      sortBy: 'relevance',
      error: null,
    });
    expect(typeof body.processingTime).toBe('number');
  });

  it('returns the exact metadata fallback envelope', async () => {
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('embedding service unavailable');
    });
    mocks.countAssets.mockResolvedValue(1);
    mocks.findManyAssets.mockResolvedValue([{
      ...gridAsset('fallback-1'),
      createdAt: new Date('2026-07-14T12:00:00.000Z'),
      updatedAt: new Date('2026-07-14T12:01:00.000Z'),
      tags: [],
    }]);

    const response = await POST(request({ query: 'fallback' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'error', 'filters', 'pagination', 'processingTime', 'query', 'results', 'searchType', 'seed', 'sortBy',
    ]);
    expect(body).toMatchObject({
      error: 'Semantic search unavailable. Showing filename matches.',
      cached: false,
      filters: {},
      pagination: { total: 1, page: 1, limit: 30, offset: 0, hasMore: false },
      seed: null,
      query: 'fallback',
      searchType: 'metadata',
      sortBy: 'relevance',
    });
    expect(body.results).toEqual([expect.objectContaining({
      id: 'fallback-1',
      thumbnailUrl: 'https://blob.test/fallback-1-thumb.png',
      similarity: 0,
      relevance: 0,
    })]);
  });

  it('applies tag filters, sort, seed, and pagination in the metadata branch', async () => {
    mocks.createEmbeddingService.mockImplementation(() => { throw new Error('provider unavailable'); });
    mocks.countAssets.mockResolvedValue(3);
    mocks.findManyAssets.mockResolvedValue([
      { ...gridAsset('fallback-date'), createdAt: new Date('2026-07-14T12:00:00.000Z'), favorite: true, tags: [] },
      { ...gridAsset('fallback-old'), createdAt: new Date('2026-07-13T12:00:00.000Z'), favorite: false, tags: [] },
    ]);

    const response = await POST(request({
      query: 'fallback', filters: { tags: ['reaction'] }, sortBy: 'favorite', seed: 424242, limit: 1, offset: 1,
    }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(body.pagination).toMatchObject({ total: 3, page: 2, limit: 1, offset: 1, hasMore: true });
    expect(body.seed).toBe(424242);
    expect(mocks.findManyAssets).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tags: { some: { tag: { ownerUserId: 'user-1', name: { in: ['reaction'] } } } } }),
    }));
  });

  it('maps provider failures to a stable public code and message', async () => {
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockRejectedValue(new EmbeddingError('provider secret should not escape', 500)),
    });
    const response = await POST(request({ query: 'provider failure' }));
    const body = await boundaryBody(response);
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: 'server_error', error: 'Search is temporarily unavailable.' });
    expect(body.error).not.toContain('provider secret');
  });

  it('returns the exact semantic success envelope with BigInt total_count converted safely', async () => {
    mocks.queryRaw.mockResolvedValue([snakeRow('semantic-1', BigInt(2))]);

    const response = await POST(request({ query: 'semantic', sortBy: 'date' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'error', 'filters', 'pagination', 'processingTime', 'query', 'results', 'searchType', 'seed', 'sortBy',
    ]);
    expect(body).toMatchObject({
      cached: false,
      filters: {},
      query: 'semantic',
      searchType: 'semantic',
      sortBy: 'date',
      pagination: { total: 2, page: 1, limit: 30, offset: 0, hasMore: false },
      seed: null,
      error: null,
    });
    expect(body.results).toEqual([expect.objectContaining({
      id: 'semantic-1',
      thumbnailUrl: 'https://blob.test/semantic-1-thumb.png',
      similarity: 0.91,
      relevance: 91,
    })]);
    expect(typeof (body.pagination as { total: number }).total).toBe('number');
  });

  it('returns the explicit empty semantic envelope', async () => {
    mocks.queryRaw.mockResolvedValue([]);

    const response = await POST(request({ query: 'nothing' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'cached', 'error', 'filters', 'pagination', 'processingTime', 'query', 'results', 'searchType', 'seed', 'sortBy',
    ]);
    expect(body).toMatchObject({
      cached: false,
      filters: {},
      query: 'nothing',
      results: [],
      searchType: 'semantic',
      sortBy: 'relevance',
      pagination: { total: 0, page: 1, limit: 30, offset: 0, hasMore: false },
      seed: null,
      error: null,
    });
  });

  it('returns the exact typed error envelope', async () => {
    mocks.createEmbeddingService.mockImplementation(() => {
      throw new Error('provider unavailable');
    });
    mocks.findManyAssets.mockRejectedValue(new Error('metadata database failed'));

    const response = await POST(request({ query: 'broken' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(500);
    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'pagination', 'query', 'results']);
    expect(body).toEqual({
      error: 'Failed to perform advanced search',
      code: 'server_error',
      results: [],
      query: 'broken',
      pagination: { total: 0, page: 1, limit: 30, offset: 0, hasMore: false },
    });
  });

  it('returns the same error envelope for an invalid embedding vector', async () => {
    mocks.createEmbeddingService.mockReturnValue({
      embedText: vi.fn().mockResolvedValue({ embedding: [1], model: 'clip-test' }),
    });

    const response = await POST(request({ query: 'bad vector' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(500);
    expect(Object.keys(body).sort()).toEqual(['code', 'error', 'pagination', 'query', 'results']);
    expect(body).toEqual({
      error: 'Invalid embedding format from service',
      code: 'invalid_embedding',
      results: [],
      query: 'bad vector',
      pagination: { total: 0, page: 1, limit: 30, offset: 0, hasMore: false },
    });
  });

  it('does not misclassify a rejected database query as invalid embedding', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('pgvector query failed'));

    const response = await POST(request({ query: 'database failure' }));
    const body = await boundaryBody(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'Failed to perform advanced search',
      code: 'server_error',
      results: [],
      query: 'database failure',
      pagination: { total: 0, page: 1, limit: 30, offset: 0, hasMore: false },
    });
    expect(body.error).not.toBe('Invalid embedding format from service');
  });
});
