import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    assetTag: { findMany },
  },
}));

import { groupAssetTagsById, loadTagsByAssetId } from '@/lib/asset-tags';

describe('groupAssetTagsById', () => {
  it('buckets join rows into per-asset tag DTOs', () => {
    expect(
      groupAssetTagsById([
        { assetId: 'a', tag: { id: 't1', name: 'reaction' } },
        { assetId: 'b', tag: { id: 't2', name: 'og' } },
        { assetId: 'a', tag: { id: 't3', name: 'cats' } },
      ]),
    ).toEqual({
      a: [
        { id: 't1', name: 'reaction' },
        { id: 't3', name: 'cats' },
      ],
      b: [{ id: 't2', name: 'og' }],
    });
  });

  it('returns an empty record for no rows', () => {
    expect(groupAssetTagsById([])).toEqual({});
  });
});

describe('loadTagsByAssetId', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('skips the database when there are no assets', async () => {
    await expect(loadTagsByAssetId([])).resolves.toEqual({});
    expect(findMany).not.toHaveBeenCalled();
  });

  it('loads every asset in one query and groups the join rows', async () => {
    findMany.mockResolvedValue([
      { assetId: 'asset-1', tag: { id: 't1', name: 'reaction' } },
      { assetId: 'asset-2', tag: { id: 't2', name: 'og' } },
    ]);

    await expect(loadTagsByAssetId(['asset-1', 'asset-2'])).resolves.toEqual({
      'asset-1': [{ id: 't1', name: 'reaction' }],
      'asset-2': [{ id: 't2', name: 'og' }],
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { assetId: { in: ['asset-1', 'asset-2'] } },
      select: {
        assetId: true,
        tag: { select: { id: true, name: true } },
      },
    });
  });
});
