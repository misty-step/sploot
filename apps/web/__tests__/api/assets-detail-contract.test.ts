import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuth: mocks.getAuth,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({ clear: vi.fn() }),
}));

vi.mock('@/lib/slug-cache', () => ({
  invalidateSlugCache: vi.fn(),
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

import { GET, PATCH } from '@/app/api/assets/[id]/route';

describe('GET /api/assets/[id] response contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: 'user-123' });
    mocks.findFirst.mockResolvedValue({
      id: 'asset-detail',
      blobUrl: 'https://blob.test/detail.png',
      thumbnailUrl: 'https://blob.test/detail-thumb.png',
      pathname: 'memes/detail.png',
      mime: 'image/png',
      size: 2048,
      width: 640,
      height: 480,
      favorite: true,
      createdAt: new Date('2026-05-16T12:00:00.000Z'),
      updatedAt: new Date('2026-05-17T12:00:00.000Z'),
      embedding: {
        assetId: 'asset-detail',
        modelName: 'clip',
        modelVersion: 'v1',
        dim: 768,
        status: 'ready',
        error: null,
        completedAt: new Date('2026-05-16T12:01:00.000Z'),
        createdAt: new Date('2026-05-16T12:00:00.000Z'),
        updatedAt: new Date('2026-05-16T12:01:00.000Z'),
      },
      tags: [{ tag: { id: 'tag-1', name: 'reaction' } }],
    });
    mocks.findUnique.mockResolvedValue({
      id: 'asset-detail',
      blobUrl: 'https://blob.test/detail.png',
      thumbnailUrl: 'https://blob.test/detail-thumb.png',
      pathname: 'memes/detail.png',
      mime: 'image/png',
      size: 2048,
      width: 640,
      height: 480,
      favorite: false,
      createdAt: new Date('2026-05-16T12:00:00.000Z'),
      updatedAt: new Date('2026-05-17T12:00:00.000Z'),
      embedding: null,
      tags: [],
    });
  });

  it('returns the required detail DTO fields at the JSON boundary', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/assets/asset-detail'),
      { params: Promise.resolve({ id: 'asset-detail' }) },
    );
    const body = JSON.parse(JSON.stringify(await response.json()));

    expect(response.status).toBe(200);
    expect(body).toEqual({
      asset: {
        id: 'asset-detail',
        blobUrl: 'https://blob.test/detail.png',
        thumbnailUrl: 'https://blob.test/detail-thumb.png',
        pathname: 'memes/detail.png',
        filename: 'memes/detail.png',
        mime: 'image/png',
        size: 2048,
        width: 640,
        height: 480,
        favorite: true,
        createdAt: '2026-05-16T12:00:00.000Z',
        embeddingStatus: 'ready',
        tags: [{ id: 'tag-1', name: 'reaction' }],
      },
    });
  });

  it('returns the explicit PATCH detail response contract', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost:3000/api/assets/asset-detail', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ favorite: false }),
      }),
      { params: Promise.resolve({ id: 'asset-detail' }) },
    );
    const body = JSON.parse(JSON.stringify(await response.json()));

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['asset', 'message']);
    expect(body).toEqual({
      asset: {
      id: 'asset-detail',
      blobUrl: 'https://blob.test/detail.png',
      thumbnailUrl: 'https://blob.test/detail-thumb.png',
        pathname: 'memes/detail.png',
        filename: 'memes/detail.png',
        mime: 'image/png',
        size: 2048,
        width: 640,
        height: 480,
        favorite: false,
        createdAt: '2026-05-16T12:00:00.000Z',
        tags: [],
      },
      message: 'Asset updated successfully',
    });
  });
});
