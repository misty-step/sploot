import { ICacheBackend, CacheStats, SearchFilters } from './types';
import { MemoryBackend } from './MemoryBackend';

/**
 * Generate a hash string from input for cache key generation.
 * Uses fast non-cryptographic hash for performance.
 * Copied from multi-layer-cache.ts (lines 362-372)
 */
function hashString(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
}

/**
 * Cache key generators
 * Uses delimited hashing to prevent collisions
 */
const CACHE_KEYS = {
  TEXT_EMBEDDING: (text: string) => `txt:${hashString(text)}`,
  IMAGE_EMBEDDING: (checksum: string) => `img:${checksum}`,
  SEARCH_RESULTS: (userId: string, query: string, filters: string) =>
    `search:${userId}:${hashString(query)}:${hashString(filters)}`,
  ASSET_LIST: (userId: string, params: string) =>
    `assets:${userId}:${hashString(params)}`,
} as const;

/**
 * Unified cache service providing domain-specific interface
 * Deep module: simple interface hides complex key generation, namespacing, backend
 *
 * Interface: 6 domain methods (text/image embeddings, search results)
 * Hidden: Key generation, hash functions, namespace routing, backend strategy
 *
 * Future migration to Redis/Vercel KV: swap backend, zero business logic changes
 */
export class CacheService {
  private backend: ICacheBackend;
  private stats: CacheStats;

  constructor(backend?: ICacheBackend) {
    this.backend = backend ?? new MemoryBackend();
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      lastReset: new Date(),
    };
  }

  // Text Embedding Methods

  async getTextEmbedding(text: string): Promise<number[] | null> {
    try {
      const key = CACHE_KEYS.TEXT_EMBEDDING(text);
      const embedding = await this.backend.get<number[]>(key);
      if (embedding) {
        this.incrementHit();
        return embedding;
      }

      this.incrementMiss();
      return null;
    } catch (error) {
      console.error('[CacheService] getTextEmbedding failed:', {
        textPreview: text.substring(0, 50),
        error: error instanceof Error ? error.message : String(error)
      });
      this.incrementMiss();
      return null;
    }
  }

  async setTextEmbedding(text: string, embedding: number[]): Promise<void> {
    try {
      const key = CACHE_KEYS.TEXT_EMBEDDING(text);
      await this.backend.set(key, embedding);
    } catch (error) {
      console.error('[CacheService] setTextEmbedding failed:', {
        textPreview: text.substring(0, 50),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Image Embedding Methods

  async getImageEmbedding(checksum: string): Promise<number[] | null> {
    try {
      const key = CACHE_KEYS.IMAGE_EMBEDDING(checksum);
      const embedding = await this.backend.get<number[]>(key);
      if (embedding) {
        this.incrementHit();
        return embedding;
      }

      this.incrementMiss();
      return null;
    } catch (error) {
      console.error('[CacheService] getImageEmbedding failed:', {
        checksum,
        error: error instanceof Error ? error.message : String(error)
      });
      this.incrementMiss();
      return null;
    }
  }

  async setImageEmbedding(checksum: string, embedding: number[]): Promise<void> {
    try {
      const key = CACHE_KEYS.IMAGE_EMBEDDING(checksum);
      await this.backend.set(key, embedding);
    } catch (error) {
      console.error('[CacheService] setImageEmbedding failed:', {
        checksum,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Search Results Methods

  async getSearchResults(
    userId: string,
    query: string,
    filters: SearchFilters = {}
  ): Promise<any[] | null> {
    try {
      const filterKey = JSON.stringify(filters);
      const key = CACHE_KEYS.SEARCH_RESULTS(userId, query, filterKey);
      const results = await this.backend.get<any[]>(key);
      if (results) {
        this.incrementHit();
        return results;
      }

      this.incrementMiss();
      return null;
    } catch (error) {
      console.error('[CacheService] getSearchResults failed:', {
        userId,
        queryPreview: query.substring(0, 50),
        error: error instanceof Error ? error.message : String(error)
      });
      this.incrementMiss();
      return null;
    }
  }

  async setSearchResults(
    userId: string,
    query: string,
    filters: SearchFilters,
    results: any[]
  ): Promise<void> {
    try {
      const filterKey = JSON.stringify(filters);
      const key = CACHE_KEYS.SEARCH_RESULTS(userId, query, filterKey);
      await this.backend.set(key, results);
    } catch (error) {
      console.error('[CacheService] setSearchResults failed:', {
        userId,
        queryPreview: query.substring(0, 50),
        resultsCount: results.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Cache Management Methods

  async invalidate(key: string): Promise<void> {
    try {
      await this.backend.delete(key);
    } catch (error) {
      console.error('[CacheService] invalidate failed:', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async clear(namespace?: string): Promise<void> {
    try {
      await this.backend.clear(namespace);
    } catch (error) {
      console.error('[CacheService] clear failed:', {
        namespace: namespace ?? 'all',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Statistics Methods

  getStats(): CacheStats {
    return {
      ...this.stats,
      hitRate: this.stats.totalRequests > 0
        ? this.stats.hits / this.stats.totalRequests
        : 0,
    };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      lastReset: new Date(),
    };
  }

  // Private Statistics Tracking

  private incrementHit(): void {
    this.stats.hits++;
    this.stats.totalRequests++;
  }

  private incrementMiss(): void {
    this.stats.misses++;
    this.stats.totalRequests++;
  }
}
