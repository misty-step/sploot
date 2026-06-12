import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    asset: {
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

import { getTasteProfile, getTasteWeightedAssets } from '@/lib/taste/taste-engine';

describe('taste engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a typed insufficient result when fewer than two bangers are embedded', async () => {
    mocks.prisma.$queryRaw.mockResolvedValueOnce([{ count: BigInt(1) }]);

    const result = await getTasteWeightedAssets({
      userId: 'user-1',
      favorite: null,
      tagId: null,
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual({
      status: 'insufficient_bangers',
      assets: [],
      total: 0,
      embeddedBangerCount: 1,
    });
  });

  it('builds a ready profile from ranked representative assets', async () => {
    mocks.prisma.asset.count.mockResolvedValueOnce(3);
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(2) }])
      .mockResolvedValueOnce([
        {
          id: 'asset-1',
          blobUrl: 'https://blob.test/a.png',
          pathname: 'a.png',
          mime: 'image/png',
          favorite: true,
          tasteScore: 0.9123,
        },
      ]);

    const profile = await getTasteProfile('user-1');

    expect(profile).toMatchObject({
      status: 'ready',
      bangerCount: 3,
      embeddedBangerCount: 2,
      label: 'near your bangers',
      representativeAssets: [
        {
          id: 'asset-1',
          tasteScore: 0.912,
        },
      ],
    });
  });
});
