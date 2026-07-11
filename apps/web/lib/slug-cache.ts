import { LRUCache } from 'lru-cache';

import { prisma } from './db';

/**
 * Resolve share slugs through a process-local hot cache and the authoritative
 * indexed Postgres row. A cold process performs one normal database lookup;
 * correctness never depends on a second remote cache service.
 *
 * Node.js runtime only: this module imports Prisma Client.
 */
const slugCache = new LRUCache<string, string>({
  max: 100,
  ttl: 5 * 60 * 1000,
});

export async function resolveShareSlug(slug: string): Promise<string | null> {
  const cachedAssetId = slugCache.get(slug);
  if (cachedAssetId) {
    return cachedAssetId;
  }

  if (!prisma) {
    console.error('Database not configured');
    return null;
  }

  const asset = await prisma.asset.findFirst({
    where: { shareSlug: slug, deletedAt: null },
    select: { id: true },
  });

  if (asset) {
    slugCache.set(slug, asset.id);
  }

  return asset?.id ?? null;
}

export async function invalidateSlugCache(slug: string): Promise<void> {
  slugCache.delete(slug);
}
