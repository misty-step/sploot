import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    assetTag: {
      findMany: mocks.findMany,
    },
  },
}));

import { loadTagsByAssetId } from '@/lib/asset-tags';

describe('loadTagsByAssetId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the query when there are no asset ids', async () => {
    await expect(loadTagsByAssetId([])).resolves.toEqual({});
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('loads every page of tags in one findMany and groups them by asset', async () => {
    mocks.findMany.mockResolvedValue([
      { assetId: 'asset-1', tag: { id: 'tag-a', name: 'reaction' } },
      { assetId: 'asset-1', tag: { id: 'tag-b', name: 'og' } },
      { assetId: 'asset-2', tag: { id: 'tag-c', name: 'cats' } },
    ]);

    await expect(loadTagsByAssetId(['asset-1', 'asset-2', 'asset-3'])).resolves.toEqual({
      'asset-1': [
        { id: 'tag-a', name: 'reaction' },
        { id: 'tag-b', name: 'og' },
      ],
      'asset-2': [{ id: 'tag-c', name: 'cats' }],
    });

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { assetId: { in: ['asset-1', 'asset-2', 'asset-3'] } },
      select: {
        assetId: true,
        tag: { select: { id: true, name: true } },
      },
    });
  });

  it('returns an empty record when the page has ids but no tags', async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(loadTagsByAssetId(['asset-1'])).resolves.toEqual({});
  });
});
