/**
 * Unified cache module - barrel exports and singleton management
 *
 * Provides application-wide caching with strategy pattern for backend swapping.
 * Default: Memory-backed LRU cache
 * Future: Swap to Redis or Vercel KV by changing backend in getCacheService()
 */

// Export types
export type { ICacheBackend, CacheStats, SearchFilters } from './types';

// Export classes
export { CacheService } from './CacheService';
export { MemoryBackend } from './MemoryBackend';

// Import for singleton
import { CacheService } from './CacheService';

// Singleton instance
let cacheServiceInstance: CacheService | null = null;

/**
 * Get the singleton cache service instance
 *
 * Lazy-initializes on first call with MemoryBackend.
 * Returns same instance on subsequent calls for consistency.
 *
 * @returns Singleton CacheService instance
 *
 * @example
 * ```typescript
 * import { getCacheService } from '@/lib/cache';
 *
 * const cache = getCacheService();
 * const embedding = await cache.getTextEmbedding('query text');
 * ```
 */
export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

/**
 * Create a new cache service instance with custom backend
 *
 * Useful for testing with mock backends or creating isolated cache instances.
 * Does not affect the singleton instance returned by getCacheService().
 *
 * @param backend - Optional custom backend (defaults to MemoryBackend)
 * @returns New CacheService instance
 *
 * @example
 * ```typescript
 * // Testing with mock backend
 * import { createCacheService } from '@/lib/cache';
 *
 * const mockBackend = new MockCacheBackend();
 * const cache = createCacheService(mockBackend);
 * ```
 *
 * @example
 * ```typescript
 * // Future: Swap to Vercel KV
 * import { createCacheService } from '@/lib/cache';
 * import { VercelKVBackend } from '@/lib/cache/VercelKVBackend';
 *
 * const cache = createCacheService(new VercelKVBackend());
 * ```
 */
export function createCacheService(backend?: import('./types').ICacheBackend): CacheService {
  return new CacheService(backend);
}
