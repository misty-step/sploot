import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({
  getAuthWithUser: vi.fn(),
  requireUserIdWithSync: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getAuthWithUser: auth.getAuthWithUser,
  requireUserIdWithSync: auth.requireUserIdWithSync,
}));

import { GET } from '@/app/api/assets/route';
import { prisma } from '@/lib/db';

const OWNER_ID = 'shuffle-owner-user';
const OTHER_ID = 'shuffle-other-user';

function request(searchParams: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/assets');
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  return new NextRequest(url);
}

async function deleteUser(id: string) {
  await prisma.user.deleteMany({ where: { id } });
}

describe('GET /api/assets seeded shuffle integration', () => {
  beforeAll(async () => {
    if (!prisma) {
      throw new Error('DATABASE_URL is required for assets shuffle integration tests');
    }
  });

  beforeEach(async () => {
    auth.getAuthWithUser.mockResolvedValue({
      userId: OWNER_ID,
      syncStatus: 'synced',
      syncError: null,
    });

    await deleteUser(OWNER_ID);
    await deleteUser(OTHER_ID);

    await prisma.user.createMany({
      data: [
        { id: OWNER_ID, email: 'shuffle-owner@sploot.test' },
        { id: OTHER_ID, email: 'shuffle-other@sploot.test' },
      ],
    });

    await prisma.asset.createMany({
      data: [
        asset('shuffle-a', OWNER_ID, 'a.png', 1),
        asset('shuffle-b', OWNER_ID, 'b.png', 2),
        asset('shuffle-c', OWNER_ID, 'c.png', 3),
        asset('shuffle-d', OWNER_ID, 'd.png', 4),
        asset('shuffle-other', OTHER_ID, 'other.png', 5),
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await deleteUser(OWNER_ID);
    await deleteUser(OTHER_ID);
  });

  it('returns a deterministic private shuffle for the same seed and limit', async () => {
    const params = {
      sortBy: 'shuffle',
      shuffleSeed: '424242',
      limit: '3',
      offset: '0',
    };

    const first = await GET(request(params), { params: Promise.resolve({}) });
    const second = await GET(request(params), { params: Promise.resolve({}) });

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.assets).toHaveLength(3);
    expect(firstBody.assets.map((asset: any) => asset.id)).toEqual(
      secondBody.assets.map((asset: any) => asset.id)
    );
    expect(firstBody.assets.map((asset: any) => asset.id)).not.toContain('shuffle-other');
    expect(firstBody.pagination).toEqual({
      total: 4,
      limit: 3,
      offset: 0,
      hasMore: true,
    });
  });
});

function asset(id: string, ownerUserId: string, filename: string, size: number) {
  return {
    id,
    ownerUserId,
    blobUrl: `https://sploot-test.public.blob.vercel-storage.com/${filename}`,
    pathname: filename,
    mime: 'image/png',
    size,
    checksumSha256: `${ownerUserId}-${filename}`,
  };
}
