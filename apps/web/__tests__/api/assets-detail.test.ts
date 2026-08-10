import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticatedUserId: 'qa-design-user',
  findFirstAsset: vi.fn(),
  transaction: vi.fn(),
  clearCache: vi.fn(),
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

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      findFirst: mocks.findFirstAsset,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    clear: mocks.clearCache,
  }),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: any) => handler,
}));

import { GET, PATCH } from '@/app/api/assets/[id]/route';

function request(id: string, init?: RequestInit) {
  return {
    req: new NextRequest(`http://localhost:3000/api/assets/${id}`, init),
    context: { params: Promise.resolve({ id }) },
  };
}

const RAW_EMBEDDING_ROW = {
  assetId: 'asset-1',
  modelName: 'clip',
  modelVersion: 'v1',
  dim: 768,
  status: 'ready',
  // Internal fields a full Prisma `include: { embedding: true }` relation
  // carries that must never reach the client DTO.
  processingClaimToken: 'secret-claim-token',
  error: null,
  attemptCount: 0,
  reviveCount: 0,
  nextAttemptAt: null,
  terminalAt: null,
  completedAt: new Date('2026-07-01T00:00:00Z'),
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

describe('GET /api/assets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'qa-design-user';
  });

  it('returns thumbnailUrl and a sanitized embedding sub-object, never the raw Prisma relation', async () => {
    mocks.findFirstAsset.mockResolvedValue({
      id: 'asset-1',
      blobUrl: 'https://blob/a.png',
      thumbnailUrl: 'https://blob/thumb-a.png',
      pathname: 'memes/a.png',
      mime: 'image/png',
      size: 1024,
      width: 320,
      height: 240,
      favorite: true,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      embedding: RAW_EMBEDDING_ROW,
      tags: [{ tag: { id: 'tag-1', name: 'reaction' } }],
    });

    const { req, context } = request('asset-1');
    const res = await GET(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    // sploot-049: the detail route hand-rolled its response and dropped
    // thumbnailUrl entirely, the same field-drop bug 048 fixed elsewhere.
    expect(body.asset.thumbnailUrl).toBe('https://blob/thumb-a.png');
    expect(body.asset.filename).toBe('a.png');
    expect(body.asset.tags).toEqual([{ id: 'tag-1', name: 'reaction' }]);
    expect(body.asset.embedding).toEqual({
      assetId: 'asset-1',
      modelName: 'clip',
      modelVersion: 'v1',
      status: 'ready',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    expect(body.asset.embedding).not.toHaveProperty('processingClaimToken');
    expect(body.asset.embedding).not.toHaveProperty('attemptCount');
    expect(body.asset.embedding).not.toHaveProperty('dim');
  });

  it('returns 404 when the asset is not found', async () => {
    mocks.findFirstAsset.mockResolvedValue(null);
    const { req, context } = request('missing');
    const res = await GET(req, context);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/assets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticatedUserId = 'qa-design-user';
  });

  it('returns thumbnailUrl and a sanitized embedding sub-object after an update', async () => {
    mocks.transaction.mockImplementation(async (fn: any) =>
      fn({
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        asset: {
          findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: 'asset-1',
            blobUrl: 'https://blob/a.png',
            thumbnailUrl: 'https://blob/thumb-a.png',
            pathname: 'memes/a.png',
            mime: 'image/png',
            size: 1024,
            width: 320,
            height: 240,
            favorite: true,
            createdAt: new Date('2026-07-01T00:00:00Z'),
            updatedAt: new Date('2026-07-01T00:00:00Z'),
            embedding: RAW_EMBEDDING_ROW,
            tags: [{ tag: { id: 'tag-1', name: 'reaction' } }],
          }),
        },
        assetTag: { deleteMany: vi.fn(), create: vi.fn() },
        tag: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn(), create: vi.fn() },
      }),
    );

    const { req, context } = request('asset-1', {
      method: 'PATCH',
      body: JSON.stringify({ favorite: true }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req, context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.asset.thumbnailUrl).toBe('https://blob/thumb-a.png');
    expect(body.asset.filename).toBe('a.png');
    expect(body.asset.embedding).toEqual({
      assetId: 'asset-1',
      modelName: 'clip',
      modelVersion: 'v1',
      status: 'ready',
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    expect(body.asset.embedding).not.toHaveProperty('processingClaimToken');
  });
});
