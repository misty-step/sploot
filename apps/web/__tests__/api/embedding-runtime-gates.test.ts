import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getAuthWithUser: vi.fn(),
  createEmbeddingService: vi.fn(),
  getSearchResults: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuth: mocks.getAuth,
  getAuthWithUser: mocks.getAuthWithUser,
}));

vi.mock('@/lib/embeddings', () => ({
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
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      findFirst: mocks.findFirst,
    },
  },
  vectorSearch: vi.fn(),
  logSearch: vi.fn(),
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
