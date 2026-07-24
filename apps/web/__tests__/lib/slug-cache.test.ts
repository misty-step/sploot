import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: { asset: { findFirst } },
}));

import { invalidateSlugCache, resolveShareSlug } from '@/lib/slug-cache';

describe('share slug resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a live share slug from Postgres every time', async () => {
    findFirst.mockResolvedValue({ id: 'asset-1' });

    await expect(resolveShareSlug('warm-slug')).resolves.toBe('asset-1');
    await expect(resolveShareSlug('warm-slug')).resolves.toBe('asset-1');

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { shareSlug: 'warm-slug', deletedAt: null },
      select: { id: true },
    });
  });

  it('returns null after revoke when shareSlug no longer matches', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'asset-1' })
      .mockResolvedValueOnce(null);

    await expect(resolveShareSlug('revoked-slug')).resolves.toBe('asset-1');
    await expect(resolveShareSlug('revoked-slug')).resolves.toBeNull();
  });

  it('invalidateSlugCache is a stable no-op seam', async () => {
    findFirst.mockResolvedValue({ id: 'asset-1' });
    await invalidateSlugCache('any-slug');
    await expect(resolveShareSlug('any-slug')).resolves.toBe('asset-1');
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it('does not invent a hit for a missing slug', async () => {
    findFirst.mockResolvedValue(null);

    await expect(resolveShareSlug('missing-slug')).resolves.toBeNull();
    await expect(resolveShareSlug('missing-slug')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
