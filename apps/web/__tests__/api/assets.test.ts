import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };

  const prisma = {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    assetTag: {
      findMany: vi.fn(),
    },
    assetEmbedding: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    tx,
    prisma,
    getAuthWithUser: vi.fn(),
    requireUserIdWithSync: vi.fn(),
    getDbFingerprint: vi.fn(),
  };
});

vi.mock('@/lib/auth/server', () => ({
  getAuthWithUser: mocks.getAuthWithUser,
  requireUserIdWithSync: mocks.requireUserIdWithSync,
}));

vi.mock('@/lib/db-fingerprint', () => ({
  getDbFingerprint: mocks.getDbFingerprint,
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
  upsertAssetEmbedding: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/embeddings', () => ({
  createEmbeddingService: vi.fn(),
  EmbeddingError: class EmbeddingError extends Error {},
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

import { GET } from '@/app/api/assets/route';

function request(searchParams: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/assets');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url);
}

describe('GET /api/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAuthWithUser.mockResolvedValue({
      userId: 'user-123',
      syncStatus: 'synced',
      syncError: null,
    });
    mocks.getDbFingerprint.mockReturnValue({ host: 'test-db', hash: 'abc123' });
    mocks.prisma.asset.count.mockResolvedValue(2);
    mocks.prisma.asset.findMany.mockResolvedValue([]);
    mocks.prisma.assetTag.findMany.mockResolvedValue([]);
    mocks.tx.$executeRaw.mockResolvedValue(1);
    mocks.tx.$queryRaw.mockResolvedValue([
      {
        id: 'asset-b',
        blobUrl: 'https://blob.test/b.png',
        pathname: 'memes/b.png',
        mime: 'image/png',
        width: 640,
        height: 480,
        favorite: false,
        size: 2048,
        createdAt: new Date('2026-05-15T12:00:00.000Z'),
        updatedAt: new Date('2026-05-15T12:00:00.000Z'),
        embeddingId: null,
        embeddingModelName: null,
        embeddingModelVersion: null,
        embeddingStatus: null,
        embeddingCreatedAt: null,
      },
      {
        id: 'asset-a',
        blobUrl: 'https://blob.test/a.png',
        pathname: 'memes/a.png',
        mime: 'image/png',
        width: 320,
        height: 240,
        favorite: true,
        size: 1024,
        createdAt: new Date('2026-05-14T12:00:00.000Z'),
        updatedAt: new Date('2026-05-14T12:00:00.000Z'),
        embeddingId: null,
        embeddingModelName: null,
        embeddingModelVersion: null,
        embeddingStatus: null,
        embeddingCreatedAt: null,
      },
    ]);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.tx));
  });

  it('returns a seeded shuffle page for the authenticated user', async () => {
    const response = await GET(request({
      sortBy: 'shuffle',
      shuffleSeed: '500000',
      limit: '2',
      offset: '0',
    }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assets.map((asset: any) => asset.id)).toEqual(['asset-b', 'asset-a']);
    expect(body.pagination).toEqual({
      total: 2,
      limit: 2,
      offset: 0,
      hasMore: false,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.calls[0][1]).toBe(0.5);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('requires shuffleSeed when sortBy is shuffle', async () => {
    const response = await GET(request({ sortBy: 'shuffle' }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('shuffleSeed is required when sortBy=shuffle.');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('orders non-shuffle assets by shared sort fields', async () => {
    const response = await GET(request({
      sortBy: 'size',
      sortOrder: 'asc',
      limit: '10',
      offset: '0',
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { size: 'asc' },
      })
    );
  });

  it('supports pathname sorting for name UI order', async () => {
    const response = await GET(request({
      sortBy: 'pathname',
      sortOrder: 'desc',
    }), { params: Promise.resolve({}) });

    expect(response.status).toBe(200);
    expect(mocks.prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { pathname: 'desc' },
      })
    );
  });

  it('rejects unsupported sortBy values instead of coercing to createdAt', async () => {
    const response = await GET(request({ sortBy: 'favorite' }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid sortBy parameter. Must be one of: createdAt, updatedAt, size, pathname, shuffle.');
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('rejects shuffleSeed outside the supported range', async () => {
    const response = await GET(request({
      sortBy: 'shuffle',
      shuffleSeed: '1000001',
    }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid shuffleSeed parameter. Must be integer 0-1000000.');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects shuffleSeed outside shuffle sort mode', async () => {
    const response = await GET(request({ shuffleSeed: '500000' }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('shuffleSeed is only supported when sortBy=shuffle.');
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('rejects limit values outside the documented bounds', async () => {
    const response = await GET(request({ limit: '101' }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid limit parameter. Must be integer 1-100.');
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed integer query parameters', async () => {
    const response = await GET(request({ limit: '10lol' }), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid limit parameter. Must be integer 1-100.');
    expect(mocks.prisma.asset.findMany).not.toHaveBeenCalled();
  });
});
