import { createHash } from 'node:crypto';
import { ICacheBackend, CacheStats, SearchFilters } from './types';
import { MemoryBackend } from './MemoryBackend';
import { PostgresTextEmbeddingStore } from './PostgresTextEmbeddingStore';
import { normalizeSearchQuery } from '../search-config';

/**
 * Cache-key versioning deliberately invalidates the old 32-bit identities.
 * Old entries are allowed to expire naturally; reading them would reintroduce
 * cross-query contamination during a rolling deployment.
 */
const CACHE_KEY_VERSION = 'v2';

/**
 * Generate a deterministic, collision-resistant identity for cache keys.
 * The full SHA-256 digest is cheap compared with embedding/database work and
 * avoids lossy 32-bit truncation for persistent and in-memory namespaces.
 */
function stableIdentity(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Cache key generators
 * Uses delimited hashing to prevent collisions
 */
function serializeSearchFilters(filters: SearchFilters): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(filters).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ))
  );
}

const CACHE_KEYS = {
  TEXT_EMBEDDING: (text: string, model: string) =>
    `txt:${CACHE_KEY_VERSION}:${stableIdentity(model)}:${stableIdentity(normalizeSearchQuery(text))}`,
  IMAGE_EMBEDDING: (checksum: string) => `img:${checksum}`,
  SEARCH_RESULTS: (userId: string, query: string, filters: string) =>
    `search:${CACHE_KEY_VERSION}:${userId}:${stableIdentity(normalizeSearchQuery(query))}:${stableIdentity(filters)}`,
  ASSET_LIST: (userId: string, params: string) =>
    `assets:${CACHE_KEY_VERSION}:${userId}:${stableIdentity(params)}`,
} as const;

/**
 * Unified cache service providing domain-specific interface
 * Deep module: simple interface hides complex key generation, namespacing, backend
 *
 * Interface: 6 domain methods (text/image embeddings, search results)
 * Hidden: Key generation, hash functions, namespace routing, backend strategy
 *
 * Backend changes stay behind ICacheBackend; business methods remain stable.
 */
export class CacheService {
  private backend: ICacheBackend;
  private textEmbeddingStore: PostgresTextEmbeddingStore;
  private stats: CacheStats;

  constructor(backend?: ICacheBackend) {
    this.backend = backend ?? new MemoryBackend();
    this.textEmbeddingStore = new PostgresTextEmbeddingStore();
    this.stats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      hitRate: 0,
      lastReset: new Date(),
    };
  }

  // Text Embedding Methods

  async getTextEmbedding(text: string, model = ''): Promise<number[] | null> {
    try {
      const key = CACHE_KEYS.TEXT_EMBEDDING(text, model);
      const embedding = await this.backend.get<number[]>(key);
      if (embedding) {
        this.incrementHit();
        return embedding;
      }

      // L2: persistent store survives serverless instance churn.
      const persisted = await this.textEmbeddingStore.get(key);
      if (persisted) {
        await this.backend.set(key, persisted);
        this.incrementHit();
        return persisted;
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

  async setTextEmbedding(text: string, embedding: number[], model = ''): Promise<void> {
    try {
      const key = CACHE_KEYS.TEXT_EMBEDDING(text, model);
      await this.backend.set(key, embedding);
      await this.textEmbeddingStore.set(key, model, embedding);
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
      const filterKey = serializeSearchFilters(filters);
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

  async getSearchResultPage(
    userId: string,
    query: string,
    filters: SearchFilters = {},
  ): Promise<{ results: any[]; total: number; hasMore?: boolean; nextCursor?: string } | null> {
    try {
      const filterKey = serializeSearchFilters({ ...filters, __pageEnvelope: true });
      const key = CACHE_KEYS.SEARCH_RESULTS(userId, query, filterKey);
      const value = await this.backend.get<any>(key);
      if (!value) {
        this.incrementMiss();
        return null;
      }

      this.incrementHit();
      if (Array.isArray(value)) {
        return { results: value, total: value.length };
      }
      if (Array.isArray(value.results) && Number.isInteger(value.total)) {
        return {
          results: value.results,
          total: value.total,
          ...(typeof value.hasMore === 'boolean' ? { hasMore: value.hasMore } : {}),
          ...(typeof value.nextCursor === 'string' ? { nextCursor: value.nextCursor } : {}),
        };
      }
      this.incrementMiss();
      return null;
    } catch (error) {
      console.error('[CacheService] getSearchResultPage failed:', {
        userId,
        queryPreview: query.substring(0, 50),
        error: error instanceof Error ? error.message : String(error),
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
      const filterKey = serializeSearchFilters(filters);
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

  async setSearchResultPage(
    userId: string,
    query: string,
    filters: SearchFilters,
    results: any[],
    total: number,
    hasMore: boolean,
    nextCursor?: string,
  ): Promise<void> {
    try {
      const filterKey = serializeSearchFilters({ ...filters, __pageEnvelope: true });
      const key = CACHE_KEYS.SEARCH_RESULTS(userId, query, filterKey);
      await this.backend.set(key, { results, total, hasMore, ...(nextCursor ? { nextCursor } : {}) });
    } catch (error) {
      console.error('[CacheService] setSearchResultPage failed:', {
        userId,
        queryPreview: query.substring(0, 50),
        resultsCount: results.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Cache Management Methods

  async invalidate(key: string): Promise<void> {
    try {
      await this.backend.delete(key);
      if (key.startsWith('txt:')) {
        await this.textEmbeddingStore.delete(key);
      }
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
      if (namespace === undefined || namespace === 'txt') {
        await this.textEmbeddingStore.clear();
      }
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
