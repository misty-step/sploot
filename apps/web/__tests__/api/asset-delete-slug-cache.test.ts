import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  findAsset: vi.fn(),
  updateAsset: vi.fn(),
  clearCache: vi.fn(),
  invalidateSlugCache: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getAuth: mocks.getAuth }));

vi.mock('@/lib/db', () => ({
  prisma: {
    asset: {
      findFirst: mocks.findAsset,
      update: mocks.updateAsset,
      delete: vi.fn(),
    },
    assetTag: { deleteMany: vi.fn() },
    assetEmbedding: { deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  getCacheService: () => ({ clear: mocks.clearCache }),
}));

vi.mock('@/lib/slug-cache', () => ({
  invalidateSlugCache: mocks.invalidateSlugCache,
}));

vi.mock('@/lib/with-observability', () => ({
  withObservability: (handler: unknown) => handler,
}));

import { DELETE } from '@/app/api/assets/[id]/route';

describe('DELETE /api/assets/[id] share-slug cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.findAsset.mockResolvedValue({
      id: 'asset-1',
      shareSlug: 'shared-slug',
    });
    mocks.updateAsset.mockResolvedValue({
      id: 'asset-1',
      deletedAt: new Date('2026-07-10T00:00:00Z'),
    });
  });

  it('invalidates a warmed slug immediately after soft deletion', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/assets/asset-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'asset-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.invalidateSlugCache).toHaveBeenCalledWith('shared-slug');
  });
});
