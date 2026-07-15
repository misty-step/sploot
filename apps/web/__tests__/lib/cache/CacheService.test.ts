import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests cover in-memory (L1) cache semantics in isolation. The
// persistent text-embedding L2 is disabled by mocking out prisma; it has its
// own coverage in text-embedding-l2.test.ts.
vi.mock('@/lib/db', () => ({ prisma: null }));

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
  const imageModel = 'image-model:v1';
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

    it('does not let known legacy 32-bit collisions cross-contaminate embeddings', async () => {
      await cacheService.setTextEmbedding('a!', [0.1], 'model');

      await expect(cacheService.getTextEmbedding('`@', 'model')).resolves.toBeNull();
      await expect(cacheService.getTextEmbedding('a!', 'model')).resolves.toEqual([0.1]);

      const keys = Array.from(mockBackend.getStore().keys());
      expect(keys.some((key) => key.startsWith('txt:v2:'))).toBe(true);
    });

    it('ignores pre-v2 text keys so old lossy entries migrate by expiry', async () => {
      await mockBackend.set('txt:0:2cg', [9, 9, 9]);

      await expect(cacheService.getTextEmbedding('a!', '')).resolves.toBeNull();
    });
  });

  describe('Image Embeddings', () => {
    it('should return null on cache miss', async () => {
      const result = await cacheService.getImageEmbedding('abc123', imageModel);
      expect(result).toBeNull();
    });

    it('should store and retrieve image embedding by checksum', async () => {
      const embedding = [0.7, 0.8, 0.9];
      const checksum = 'abc123def456';

      await cacheService.setImageEmbedding(checksum, imageModel, embedding);
      const result = await cacheService.getImageEmbedding(checksum, imageModel);

      expect(result).toEqual(embedding);
    });

    it('should use checksum directly in cache key', async () => {
      const embedding = [0.1, 0.2, 0.3];
      const checksum = 'test-checksum';

      await cacheService.setImageEmbedding(checksum, imageModel, embedding);

      const store = mockBackend.getStore();
      const keys = Array.from(store.keys());

      // Image embedding keys are versioned and bound to the exact model revision.
      expect(keys.some(key => key.startsWith('img:v2:'))).toBe(true);
    });

    it('does not cross-contaminate the same checksum across model revisions', async () => {
      const checksum = 'same-image-checksum';
      const modelV1 = 'image-model:v1';
      const modelV2 = 'image-model:v2';

      await cacheService.setImageEmbedding(checksum, modelV1, [0.1]);

      await expect(cacheService.getImageEmbedding(checksum, modelV2)).resolves.toBeNull();
      await expect(cacheService.getImageEmbedding(checksum, modelV1)).resolves.toEqual([0.1]);

      await cacheService.setImageEmbedding(checksum, modelV2, [0.2]);
      await expect(cacheService.getImageEmbedding(checksum, modelV1)).resolves.toEqual([0.1]);
      await expect(cacheService.getImageEmbedding(checksum, modelV2)).resolves.toEqual([0.2]);
    });

    it('should track stats for image embedding hits and misses', async () => {
      const embedding = [0.1, 0.2, 0.3];

      // Miss
      await cacheService.getImageEmbedding('checksum1', imageModel);

      // Set and hit
      await cacheService.setImageEmbedding('checksum1', imageModel, embedding);
      await cacheService.getImageEmbedding('checksum1', imageModel);

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(2);
    });
  });

  describe('Search Results', () => {
    const userId = 'user-123';
    const query = 'funny cats';
    const searchModelV1 = 'clip-model:v1';
    const searchModelV2 = 'clip-model:v2';
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

    it('should use the canonical query for paged search cache keys', async () => {
      const page = { results, total: 2, hasMore: false };

      await cacheService.setSearchResultPage(userId, '  Funny   Cats  ', filters, page.results, page.total, page.hasMore);

      await expect(cacheService.getSearchResultPage(userId, 'funny cats', filters)).resolves.toEqual(page);
    });

    it('does not let known legacy 32-bit collisions cross-contaminate page results', async () => {
      const firstPage = [{ id: 'asset-a' }];
      const secondPage = [{ id: 'asset-b' }];

      await cacheService.setSearchResultPage(userId, 'a!', filters, firstPage, 1, false);
      await cacheService.setSearchResultPage(userId, '`@', filters, secondPage, 1, false);

      await expect(cacheService.getSearchResultPage(userId, 'a!', filters)).resolves.toEqual({
        results: firstPage,
        total: 1,
        hasMore: false,
      });
      await expect(cacheService.getSearchResultPage(userId, '`@', filters)).resolves.toEqual({
        results: secondPage,
        total: 1,
        hasMore: false,
      });
    });

    it('does not reuse search pages when the embedding model revision changes', async () => {
      const page = [{ id: 'asset-model-v1' }];

      await cacheService.setSearchResultPage(
        userId,
        query,
        filters,
        page,
        1,
        false,
        undefined,
        searchModelV1,
      );

      await expect(cacheService.getSearchResultPage(userId, query, filters, searchModelV2)).resolves.toBeNull();
      await expect(cacheService.getSearchResultPage(userId, query, filters, searchModelV1)).resolves.toEqual({
        results: page,
        total: 1,
        hasMore: false,
      });
    });

    it('should isolate every semantic page-shaping filter', async () => {
      const baseFilters = {
        limit: 10,
        threshold: 0.2,
        sort: 'relevance' as const,
        direction: 'desc' as const,
        favoriteOnly: false,
        tagId: null,
        cursor: 'cursor-a',
      };
      const variants = [
        { ...baseFilters, threshold: 0.3 },
        { ...baseFilters, sort: 'relevance' as const, direction: 'desc' as const, favoriteOnly: true },
        { ...baseFilters, tagId: 'tag-cats' },
        { ...baseFilters, limit: 20 },
        { ...baseFilters, cursor: 'cursor-b' },
      ];

      await Promise.all(variants.map((variant, index) =>
        cacheService.setSearchResultPage(userId, 'cats', variant, [{ id: `asset-${index}` }], 1, false)
      ));

      await expect(cacheService.getSearchResultPage(userId, 'cats', baseFilters)).resolves.toBeNull();
      for (const [index, variant] of variants.entries()) {
        await expect(cacheService.getSearchResultPage(userId, 'cats', variant)).resolves.toEqual({
          results: [{ id: `asset-${index}` }],
          total: 1,
          hasMore: false,
        });
      }

      const reordered = { cursor: 'cursor-a', tagId: null, favoriteOnly: false, direction: 'desc' as const, sort: 'relevance' as const, threshold: 0.2, limit: 10 };
      await cacheService.setSearchResultPage(userId, 'cats', reordered, [{ id: 'asset-reordered' }], 1, false);
      await expect(cacheService.getSearchResultPage(userId, 'cats', baseFilters)).resolves.toEqual({
        results: [{ id: 'asset-reordered' }],
        total: 1,
        hasMore: false,
      });
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
      await cacheService.setImageEmbedding('img1', imageModel, [0.2]);
      await cacheService.setSearchResults('user1', 'query', { limit: 50 }, []);

      await cacheService.clear();

      const text = await cacheService.getTextEmbedding('text1');
      const image = await cacheService.getImageEmbedding('img1', imageModel);
      const search = await cacheService.getSearchResults('user1', 'query', { limit: 50 });

      expect(text).toBeNull();
      expect(image).toBeNull();
      expect(search).toBeNull();
    });

    it('should clear only specified namespace', async () => {
      await cacheService.setTextEmbedding('text1', [0.1]);
      await cacheService.setImageEmbedding('img1', imageModel, [0.2]);

      await cacheService.clear('txt');

      const text = await cacheService.getTextEmbedding('text1');
      const image = await cacheService.getImageEmbedding('img1', imageModel);

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
      await cacheService.setImageEmbedding('img1', imageModel, [0.3, 0.4]);
      await cacheService.setSearchResults('user1', 'cats', { limit: 10 }, [{ id: '1' }]);

      // Retrieve them
      const text = await cacheService.getTextEmbedding('query1');
      const image = await cacheService.getImageEmbedding('img1', imageModel);
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
      await cacheService.setImageEmbedding('img1', imageModel, [0.1]);
      await cacheService.getImageEmbedding('img1', imageModel);

      // Miss
      await cacheService.getSearchResults('user1', 'query', { limit: 10 });

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBeCloseTo(1 / 3, 2);
    });
  });
});
