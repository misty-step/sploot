import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  userFindUnique: vi.fn(),
  findAsset: vi.fn(),
  updateAsset: vi.fn(),
  clearCache: vi.fn(),
  invalidateSlugCache: vi.fn(),
  deleteAsset: vi.fn(),
  invalidateExports: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    asset: {
      findFirst: mocks.findAsset,
      update: mocks.updateAsset,
      delete: mocks.deleteAsset,
    },
    assetTag: { deleteMany: vi.fn() },
    assetEmbedding: { deleteMany: vi.fn() },
    libraryExport: { updateMany: mocks.invalidateExports },
    $transaction: mocks.transaction,
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
    mocks.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: {
        userId: 'user-1',
        provider: 'qa-local',
        providerSubject: 'user-1',
        source: 'qa-local',
        credentialKind: 'qa-local',
      },
      syncStatus: 'success',
    });
    mocks.userFindUnique.mockResolvedValue({ id: 'user-1' });
    mocks.findAsset.mockResolvedValue({
      id: 'asset-1',
      shareSlug: 'shared-slug',
    });
    mocks.updateAsset.mockResolvedValue({
      id: 'asset-1',
      deletedAt: new Date('2026-07-10T00:00:00Z'),
    });
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      $queryRawUnsafe: vi.fn(async () => []),
      $executeRawUnsafe: vi.fn(async () => 1),
      $executeRaw: vi.fn(),
      user: { findUnique: mocks.userFindUnique },
      asset: {
        findFirst: mocks.findAsset,
        update: mocks.updateAsset,
        delete: mocks.deleteAsset,
      },
      assetTag: { deleteMany: vi.fn() },
      assetEmbedding: { deleteMany: vi.fn() },
      libraryExport: { updateMany: mocks.invalidateExports },
    }));
  });

  it('invalidates active exports before permanent deletion', async () => {
    mocks.findAsset.mockResolvedValue({ id: 'asset-1', shareSlug: 'shared-slug' });
    mocks.deleteAsset.mockResolvedValue({ id: 'asset-1' });

    const response = await DELETE(
      new NextRequest('http://localhost:3000/api/assets/asset-1?permanent=true', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'asset-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.invalidateExports).toHaveBeenCalledWith({
      where: { ownerUserId: 'user-1', status: 'active' },
      data: { status: 'canceled' },
    });
    expect(mocks.invalidateExports.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteAsset.mock.invocationCallOrder[0],
    );
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
