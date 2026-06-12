import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'user-1',
  getAutomaticPiles: vi.fn(),
  PileEmbeddingUnavailableError: class PileEmbeddingUnavailableError extends Error {
    constructor(message: string, public code = 'pile_anchor_embeddings_unavailable') {
      super(message);
    }
  },
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

vi.mock('@/lib/piles/semantic-piles', () => ({
  DEFAULT_MAX_PILES: 6,
  DEFAULT_MINIMUM_PILE_ASSETS: 50,
  PileEmbeddingUnavailableError: mocks.PileEmbeddingUnavailableError,
  getAutomaticPiles: mocks.getAutomaticPiles,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { GET } from '@/app/api/piles/route';

function request(params: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/piles');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe('GET /api/piles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'user-1';
    mocks.getAutomaticPiles.mockResolvedValue({
      status: 'ready',
      minimumAssets: 50,
      embeddedAssetCount: 52,
      piles: [
        {
          id: 'reaction-faces',
          label: 'reaction faces',
          count: 12,
          bangers: 2,
          confidence: 0.78,
          assetIds: ['asset-1', 'asset-2'],
          thumbnailAssets: [],
        },
      ],
    });
  });

  it('returns automatic piles for the authenticated user', async () => {
    const response = await GET(request({ limit: '4', minAssets: '50' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.piles[0].label).toBe('reaction faces');
    expect(body.piles[0].assetIds).toEqual(['asset-1', 'asset-2']);
    expect(mocks.getAutomaticPiles).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        maxPiles: 4,
        minimumAssets: 50,
      })
    );
  });

  it('returns a typed insufficient status instead of fake piles', async () => {
    mocks.getAutomaticPiles.mockResolvedValue({
      status: 'insufficient_embedded_assets',
      minimumAssets: 50,
      embeddedAssetCount: 24,
      piles: [],
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'insufficient_embedded_assets',
      minimumAssets: 50,
      embeddedAssetCount: 24,
      piles: [],
    });
  });

  it('rejects invalid limits before querying', async () => {
    const response = await GET(request({ limit: '999' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid limit');
    expect(mocks.getAutomaticPiles).not.toHaveBeenCalled();
  });

  it('keeps the auth contract stable', async () => {
    mocks.authenticatedUserId = '';

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mocks.getAutomaticPiles).not.toHaveBeenCalled();
  });

  it('returns a typed 503 when anchor embeddings are unavailable', async () => {
    mocks.getAutomaticPiles.mockRejectedValue(
      new mocks.PileEmbeddingUnavailableError('REPLICATE_API_TOKEN is not configured')
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'pile_anchor_embeddings_unavailable',
      retryable: true,
    });
  });
});
