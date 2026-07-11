import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: { asset: { findFirst } },
}));

import { invalidateSlugCache, resolveShareSlug } from '@/lib/slug-cache';

describe('share slug cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms a process-local cache from the authoritative database lookup', async () => {
    findFirst.mockResolvedValue({ id: 'asset-1' });

    await expect(resolveShareSlug('warm-slug')).resolves.toBe('asset-1');
    await expect(resolveShareSlug('warm-slug')).resolves.toBe('asset-1');

    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: { shareSlug: 'warm-slug', deletedAt: null },
      select: { id: true },
    });
  });

  it('queries Postgres again after explicit invalidation', async () => {
    findFirst
      .mockResolvedValueOnce({ id: 'asset-before' })
      .mockResolvedValueOnce({ id: 'asset-after' });

    await expect(resolveShareSlug('changed-slug')).resolves.toBe('asset-before');
    await invalidateSlugCache('changed-slug');
    await expect(resolveShareSlug('changed-slug')).resolves.toBe('asset-after');

    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not cache a missing slug', async () => {
    findFirst.mockResolvedValue(null);

    await expect(resolveShareSlug('missing-slug')).resolves.toBeNull();
    await expect(resolveShareSlug('missing-slug')).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
