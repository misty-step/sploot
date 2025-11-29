import { LRUCache } from 'lru-cache';
import { kv } from '@vercel/kv';
import { prisma } from './db';

/**
 * Three-tier caching for share slug resolution
 *
 * ⚠️ RUNTIME REQUIREMENT: Node.js only (uses Prisma Client)
 * Do NOT import in edge middleware or edge routes
 * Use in: API routes, server components, server actions
 *
 * Tier 1: Memory (0ms) - LRU cache for hot slugs
 * Tier 2: Vercel KV (~5-10ms) - Edge-cached for viral shares
 * Tier 3: Database (~20-50ms) - Authoritative source
 *
 * This architecture prevents database bottleneck during viral share traffic.
 * Without caching: 1000 concurrent views = 1000 DB queries
 * With caching: 1000 concurrent views = <10 DB queries
 */

// In-memory LRU cache: 100 entries, 5 minute TTL
const slugCache = new LRUCache<string, string>({
  max: 100,
  ttl: 300000 // 5 minutes
});

/**
 * Resolve a share slug to an asset ID using three-tier caching
 *
 * @param slug - The share slug to resolve
 * @returns Asset ID if found, null otherwise
 */
export async function resolveShareSlug(slug: string): Promise<string | null> {
  // Tier 1: Memory cache (instant)
  if (slugCache.has(slug)) {
    return slugCache.get(slug)!;
  }

  // Tier 2: Vercel KV (edge-cached)
  try {
    const kvResult = await kv.get<string>(`slug:${slug}`);
    if (kvResult) {
      // Warm memory cache for next request
      slugCache.set(slug, kvResult);
      return kvResult;
    }
  } catch (error) {
    // KV failure is non-fatal, fall through to database
    console.warn('KV lookup failed:', error);
  }

  // Tier 3: Database (authoritative source)
  if (!prisma) {
    console.error('Database not configured');
    return null;
  }

  const asset = await prisma.asset.findFirst({
    where: { shareSlug: slug, deletedAt: null },
    select: { id: true }
  });

  if (asset) {
    // Populate both caches for future requests
    slugCache.set(slug, asset.id);

    try {
      await kv.set(`slug:${slug}`, asset.id, { ex: 86400 }); // 24h TTL
    } catch (error) {
      // KV write failure is non-fatal
      console.warn('KV write failed:', error);
    }
  }

  return asset?.id || null;
}

/**
 * Invalidate cache for a specific slug (e.g., when slug is deleted or changed)
 *
 * @param slug - The share slug to invalidate
 */
export async function invalidateSlugCache(slug: string): Promise<void> {
  // Clear memory cache
  slugCache.delete(slug);

  // Clear KV cache
  try {
    await kv.del(`slug:${slug}`);
  } catch (error) {
    console.warn('KV delete failed:', error);
  }
}
