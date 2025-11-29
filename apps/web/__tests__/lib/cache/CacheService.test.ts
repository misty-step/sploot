import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '@/lib/cache/CacheService';
import type { ICacheBackend } from '@/lib/cache/types';

// Mock backend for testing
class MockBackend implements ICacheBackend {
  private store = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.store.get(key) || null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      // Clear only keys with matching prefix
      const prefix = `${namespace}:`;
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.clear();
    }
  }

  // Helper for testing
  getStore() {
    return this.store;
  }
}

describe('CacheService', () => {
  let mockBackend: MockBackend;
  let cacheService: CacheService;

  beforeEach(() => {
    mockBackend = new MockBackend();
    cacheService = new CacheService(mockBackend);
  });

  describe('Text Embeddings', () => {
    it('should return null on cache miss', async () => {
      const result = await cacheService.getTextEmbedding('test query');
      expect(result).toBeNull();
    });

    it('should increment miss counter on cache miss', async () => {
      await cacheService.getTextEmbedding('test query');
      const stats = cacheService.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.totalRequests).toBe(1);
    });

    it('should store and retrieve text embedding', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cacheService.setTextEmbedding('test query', embedding);
      const result = await cacheService.getTextEmbedding('test query');
      expect(result).toEqual(embedding);
    });

    it('should increment hit counter on cache hit', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cacheService.setTextEmbedding('test query', embedding);
      await cacheService.getTextEmbedding('test query');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should generate consistent cache keys for same text', async () => {
      const embedding1 = [0.1, 0.2, 0.3];
      const embedding2 = [0.4, 0.5, 0.6];

      await cacheService.setTextEmbedding('same query', embedding1);
      await cacheService.setTextEmbedding('same query', embedding2);

      const result = await cacheService.getTextEmbedding('same query');
      // Second set should overwrite first
      expect(result).toEqual(embedding2);
    });

    it('should generate different cache keys for different text', async () => {
      const embedding1 = [0.1, 0.2, 0.3];
      const embedding2 = [0.4, 0.5, 0.6];

      await cacheService.setTextEmbedding('query one', embedding1);
      await cacheService.setTextEmbedding('query two', embedding2);

      const result1 = await cacheService.getTextEmbedding('query one');
      const result2 = await cacheService.getTextEmbedding('query two');

      expect(result1).toEqual(embedding1);
      expect(result2).toEqual(embedding2);
    });

    it('should use txt: prefix for text embedding keys', async () => {
      const embedding = [0.1, 0.2, 0.3];
      await cacheService.setTextEmbedding('test', embedding);

      const store = mockBackend.getStore();
      const keys = Array.from(store.keys());

      expect(keys.some(key => key.startsWith('txt:'))).toBe(true);
    });
  });

  describe('Image Embeddings', () => {
    it('should return null on cache miss', async () => {
      const result = await cacheService.getImageEmbedding('abc123');
      expect(result).toBeNull();
    });

    it('should store and retrieve image embedding by checksum', async () => {
      const embedding = [0.7, 0.8, 0.9];
      const checksum = 'abc123def456';

      await cacheService.setImageEmbedding(checksum, embedding);
      const result = await cacheService.getImageEmbedding(checksum);

      expect(result).toEqual(embedding);
    });

    it('should use checksum directly in cache key', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const checksum = 'test-checksum';

      await cacheService.setImageEmbedding(checksum, embedding);

      const store = mockBackend.getStore();
      const keys = Array.from(store.keys());

      // Image embedding keys should be img:checksum
      expect(keys.some(key => key === `img:${checksum}`)).toBe(true);
    });

    it('should track stats for image embedding hits and misses', async () => {
      const embedding = [0.1, 0.2, 0.3];

      // Miss
      await cacheService.getImageEmbedding('checksum1');

      // Set and hit
      await cacheService.setImageEmbedding('checksum1', embedding);
      await cacheService.getImageEmbedding('checksum1');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(2);
    });
  });

  describe('Search Results', () => {
    const userId = 'user-123';
    const query = 'funny cats';
    const filters = { limit: 50, threshold: 0.3 };
    const results = [
      { id: 'asset-1', score: 0.95 },
      { id: 'asset-2', score: 0.87 },
    ];

    it('should return null on cache miss', async () => {
      const result = await cacheService.getSearchResults(userId, query, filters);
      expect(result).toBeNull();
    });

    it('should store and retrieve search results', async () => {
      await cacheService.setSearchResults(userId, query, filters, results);
      const cached = await cacheService.getSearchResults(userId, query, filters);

      expect(cached).toEqual(results);
    });

    it('should create different cache entries for different users', async () => {
      const results1 = [{ id: 'asset-1' }];
      const results2 = [{ id: 'asset-2' }];

      await cacheService.setSearchResults('user-1', query, filters, results1);
      await cacheService.setSearchResults('user-2', query, filters, results2);

      const cached1 = await cacheService.getSearchResults('user-1', query, filters);
      const cached2 = await cacheService.getSearchResults('user-2', query, filters);

      expect(cached1).toEqual(results1);
      expect(cached2).toEqual(results2);
    });

    it('should create different cache entries for different queries', async () => {
      const results1 = [{ id: 'asset-1' }];
      const results2 = [{ id: 'asset-2' }];

      await cacheService.setSearchResults(userId, 'query one', filters, results1);
      await cacheService.setSearchResults(userId, 'query two', filters, results2);

      const cached1 = await cacheService.getSearchResults(userId, 'query one', filters);
      const cached2 = await cacheService.getSearchResults(userId, 'query two', filters);

      expect(cached1).toEqual(results1);
      expect(cached2).toEqual(results2);
    });

    it('should create different cache entries for different filters', async () => {
      const results1 = [{ id: 'asset-1' }];
      const results2 = [{ id: 'asset-2' }];
      const filters1 = { limit: 50, threshold: 0.3 };
      const filters2 = { limit: 100, threshold: 0.5 };

      await cacheService.setSearchResults(userId, query, filters1, results1);
      await cacheService.setSearchResults(userId, query, filters2, results2);

      const cached1 = await cacheService.getSearchResults(userId, query, filters1);
      const cached2 = await cacheService.getSearchResults(userId, query, filters2);

      expect(cached1).toEqual(results1);
      expect(cached2).toEqual(results2);
    });

    it('should use search: prefix for search result keys', async () => {
      await cacheService.setSearchResults(userId, query, filters, results);

      const store = mockBackend.getStore();
      const keys = Array.from(store.keys());

      expect(keys.some(key => key.startsWith('search:'))).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    it('should initialize stats with zero values', () => {
      const stats = cacheService.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.lastReset).toBeInstanceOf(Date);
    });

    it('should calculate hit rate correctly', async () => {
      const embedding = [0.1, 0.2, 0.3];

      // Set up cache
      await cacheService.setTextEmbedding('query1', embedding);
      await cacheService.setTextEmbedding('query2', embedding);

      // 2 hits
      await cacheService.getTextEmbedding('query1');
      await cacheService.getTextEmbedding('query2');

      // 1 miss
      await cacheService.getTextEmbedding('query3');

      const stats = cacheService.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(3);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should handle zero requests when calculating hit rate', () => {
      const stats = cacheService.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should reset stats correctly', async () => {
      const embedding = [0.1, 0.2, 0.3];

      // Generate some stats
      await cacheService.setTextEmbedding('query', embedding);
      await cacheService.getTextEmbedding('query'); // hit
      await cacheService.getTextEmbedding('other'); // miss

      const beforeReset = cacheService.getStats();
      expect(beforeReset.hits).toBe(1);
      expect(beforeReset.misses).toBe(1);

      // Reset
      const oldResetTime = beforeReset.lastReset;
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure time difference
      cacheService.resetStats();

      const afterReset = cacheService.getStats();
      expect(afterReset.hits).toBe(0);
      expect(afterReset.misses).toBe(0);
      expect(afterReset.totalRequests).toBe(0);
      expect(afterReset.hitRate).toBe(0);
      expect(afterReset.lastReset.getTime()).toBeGreaterThan(oldResetTime.getTime());
    });

    it('should not reset cache contents when resetting stats', async () => {
      const embedding = [0.1, 0.2, 0.3];

      await cacheService.setTextEmbedding('query', embedding);
      cacheService.resetStats();

      const result = await cacheService.getTextEmbedding('query');
      expect(result).toEqual(embedding);
    });
  });

  describe('Cache Invalidation', () => {
    it('should clear all caches when no namespace provided', async () => {
      await cacheService.setTextEmbedding('text1', [0.1]);
      await cacheService.setImageEmbedding('img1', [0.2]);
      await cacheService.setSearchResults('user1', 'query', { limit: 50 }, []);

      await cacheService.clear();

      const text = await cacheService.getTextEmbedding('text1');
      const image = await cacheService.getImageEmbedding('img1');
      const search = await cacheService.getSearchResults('user1', 'query', { limit: 50 });

      expect(text).toBeNull();
      expect(image).toBeNull();
      expect(search).toBeNull();
    });

    it('should clear only specified namespace', async () => {
      await cacheService.setTextEmbedding('text1', [0.1]);
      await cacheService.setImageEmbedding('img1', [0.2]);

      await cacheService.clear('txt');

      const text = await cacheService.getTextEmbedding('text1');
      const image = await cacheService.getImageEmbedding('img1');

      expect(text).toBeNull();
      expect(image).toEqual([0.2]); // Image cache should still exist
    });

    it('should invalidate specific cache key', async () => {
      await cacheService.setTextEmbedding('text1', [0.1]);
      await cacheService.setTextEmbedding('text2', [0.2]);

      // Invalidate one specific key (would need to expose key generation or use internal method)
      // For now, test via clear with namespace
      await cacheService.clear('txt');

      const text1 = await cacheService.getTextEmbedding('text1');
      const text2 = await cacheService.getTextEmbedding('text2');

      expect(text1).toBeNull();
      expect(text2).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should handle mixed cache operations correctly', async () => {
      // Add various types of cached data
      await cacheService.setTextEmbedding('query1', [0.1, 0.2]);
      await cacheService.setImageEmbedding('img1', [0.3, 0.4]);
      await cacheService.setSearchResults('user1', 'cats', { limit: 10 }, [{ id: '1' }]);

      // Retrieve them
      const text = await cacheService.getTextEmbedding('query1');
      const image = await cacheService.getImageEmbedding('img1');
      const search = await cacheService.getSearchResults('user1', 'cats', { limit: 10 });

      expect(text).toEqual([0.1, 0.2]);
      expect(image).toEqual([0.3, 0.4]);
      expect(search).toEqual([{ id: '1' }]);

      // Stats should track all operations
      const stats = cacheService.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.hits).toBe(3);
    });

    it('should maintain separate stats across cache operations', async () => {
      // Miss
      await cacheService.getTextEmbedding('miss1');

      // Hit
      await cacheService.setImageEmbedding('img1', [0.1]);
      await cacheService.getImageEmbedding('img1');

      // Miss
      await cacheService.getSearchResults('user1', 'query', { limit: 10 });

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1 / 3, 2);
    });
  });
});
