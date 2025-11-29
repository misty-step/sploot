import { LRUCache } from 'lru-cache';
import { ICacheBackend } from './types';

/**
 * Memory-backed cache implementation using LRU eviction
 * Uses separate LRU caches for different namespaces (text, image, search, assets)
 * Each namespace has its own size limits and TTL defaults
 */
export class MemoryBackend implements ICacheBackend {
  // Namespace-specific LRU caches
  private textEmbeddings: LRUCache<string, any>;
  private imageEmbeddings: LRUCache<string, any>;
  private searchResults: LRUCache<string, any>;
  private assetMetadata: LRUCache<string, any>;

  // TTL values matching multi-layer-cache.ts exactly
  private static readonly TTL = {
    TEXT_EMBEDDING: 15 * 60 * 1000,       // 15 minutes (900000ms)
    IMAGE_EMBEDDING: 24 * 60 * 60 * 1000, // 24 hours (86400000ms)
    SEARCH_RESULTS: 5 * 60 * 1000,        // 5 minutes (300000ms)
    ASSET_METADATA: 30 * 60 * 1000,       // 30 minutes (1800000ms)
  } as const;

  constructor() {
    // Initialize separate LRU caches per namespace
    this.textEmbeddings = new LRUCache<string, any>({
      max: 100,
      ttl: MemoryBackend.TTL.TEXT_EMBEDDING,
    });

    this.imageEmbeddings = new LRUCache<string, any>({
      max: 500,
      ttl: MemoryBackend.TTL.IMAGE_EMBEDDING,
    });

    this.searchResults = new LRUCache<string, any>({
      max: 50,
      ttl: MemoryBackend.TTL.SEARCH_RESULTS,
    });

    this.assetMetadata = new LRUCache<string, any>({
      max: 200,
      ttl: MemoryBackend.TTL.ASSET_METADATA,
    });
  }

  /**
   * Get the appropriate LRU cache based on key prefix
   * Routes to namespace-specific cache for optimized eviction
   */
  private getCacheForKey(key: string): LRUCache<string, any> {
    if (key.startsWith('txt:')) {
      return this.textEmbeddings;
    } else if (key.startsWith('img:')) {
      return this.imageEmbeddings;
    } else if (key.startsWith('search:')) {
      return this.searchResults;
    } else if (key.startsWith('assets:')) {
      return this.assetMetadata;
    }

    // Default to search cache for unknown prefixes
    return this.searchResults;
  }

  /**
   * Get default TTL for a namespace
   */
  private getDefaultTTL(key: string): number {
    if (key.startsWith('txt:')) {
      return MemoryBackend.TTL.TEXT_EMBEDDING;
    } else if (key.startsWith('img:')) {
      return MemoryBackend.TTL.IMAGE_EMBEDDING;
    } else if (key.startsWith('search:')) {
      return MemoryBackend.TTL.SEARCH_RESULTS;
    } else if (key.startsWith('assets:')) {
      return MemoryBackend.TTL.ASSET_METADATA;
    }

    return MemoryBackend.TTL.SEARCH_RESULTS;
  }

  async get<T>(key: string): Promise<T | null> {
    const cache = this.getCacheForKey(key);
    const value = cache.get(key);
    return value !== undefined ? (value as T) : null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const cache = this.getCacheForKey(key);
    const effectiveTTL = ttl ?? this.getDefaultTTL(key);

    cache.set(key, value, { ttl: effectiveTTL });
  }

  async delete(key: string): Promise<boolean> {
    const cache = this.getCacheForKey(key);
    const existed = cache.has(key);
    cache.delete(key);
    return existed;
  }

  async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      // Clear all caches
      this.textEmbeddings.clear();
      this.imageEmbeddings.clear();
      this.searchResults.clear();
      this.assetMetadata.clear();
      return;
    }

    // Clear specific namespace
    if (namespace === 'txt' || namespace === 'txt:' || namespace === 'text') {
      this.textEmbeddings.clear();
    } else if (namespace === 'img' || namespace === 'img:' || namespace === 'image') {
      this.imageEmbeddings.clear();
    } else if (namespace === 'search' || namespace === 'search:') {
      this.searchResults.clear();
    } else if (namespace === 'assets' || namespace === 'assets:') {
      this.assetMetadata.clear();
    }
  }
}
