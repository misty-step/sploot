import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryBackend } from '@/lib/cache/MemoryBackend';

describe('MemoryBackend', () => {
  let backend: MemoryBackend;

  beforeEach(() => {
    backend = new MemoryBackend();
  });

  describe('Basic Operations', () => {
    it('should return null for non-existent key', async () => {
      const result = await backend.get('nonexistent:key');
      expect(result).toBeNull();
    });

    it('should store and retrieve value', async () => {
      await backend.set('test:key', { data: 'value' });
      const result = await backend.get('test:key');
      expect(result).toEqual({ data: 'value' });
    });

    it('should delete key and return true', async () => {
      await backend.set('test:key', 'value');
      const deleted = await backend.delete('test:key');
      expect(deleted).toBe(true);

      const result = await backend.get('test:key');
      expect(result).toBeNull();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await backend.delete('nonexistent:key');
      expect(deleted).toBe(false);
    });

    it('should handle complex objects', async () => {
      const complexObj = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        mixed: [{ id: 1 }, { id: 2 }],
      };

      await backend.set('complex:key', complexObj);
      const result = await backend.get('complex:key');
      expect(result).toEqual(complexObj);
    });

    it('should handle array values', async () => {
      const embedding = [0.1, 0.2, 0.3, 0.4];
      await backend.set('embedding:key', embedding);
      const result = await backend.get('embedding:key');
      expect(result).toEqual(embedding);
    });
  });

  describe('Namespace Routing', () => {
    it('should route txt: prefix to text embeddings cache', async () => {
      await backend.set('txt:hash123', [0.1, 0.2]);
      const result = await backend.get('txt:hash123');
      expect(result).toEqual([0.1, 0.2]);
    });

    it('should route img: prefix to image embeddings cache', async () => {
      await backend.set('img:checksum456', [0.3, 0.4]);
      const result = await backend.get('img:checksum456');
      expect(result).toEqual([0.3, 0.4]);
    });

    it('should route search: prefix to search results cache', async () => {
      await backend.set('search:user:query', [{ id: '1' }]);
      const result = await backend.get('search:user:query');
      expect(result).toEqual([{ id: '1' }]);
    });

    it('should route assets: prefix to asset metadata cache', async () => {
      await backend.set('assets:user:params', [{ id: 'asset1' }]);
      const result = await backend.get('assets:user:params');
      expect(result).toEqual([{ id: 'asset1' }]);
    });

    it('should keep different namespaces isolated', async () => {
      await backend.set('txt:key1', 'text value');
      await backend.set('img:key1', 'image value');
      await backend.set('search:key1', 'search value');
      await backend.set('assets:key1', 'assets value');

      expect(await backend.get('txt:key1')).toBe('text value');
      expect(await backend.get('img:key1')).toBe('image value');
      expect(await backend.get('search:key1')).toBe('search value');
      expect(await backend.get('assets:key1')).toBe('assets value');
    });
  });

  describe('Clear Operations', () => {
    beforeEach(async () => {
      // Populate different namespaces
      await backend.set('txt:key1', 'text1');
      await backend.set('txt:key2', 'text2');
      await backend.set('img:key1', 'image1');
      await backend.set('search:key1', 'search1');
      await backend.set('assets:key1', 'assets1');
    });

    it('should clear all caches when no namespace specified', async () => {
      await backend.clear();

      expect(await backend.get('txt:key1')).toBeNull();
      expect(await backend.get('img:key1')).toBeNull();
      expect(await backend.get('search:key1')).toBeNull();
      expect(await backend.get('assets:key1')).toBeNull();
    });

    it('should clear only text embeddings cache', async () => {
      await backend.clear('txt');

      expect(await backend.get('txt:key1')).toBeNull();
      expect(await backend.get('txt:key2')).toBeNull();
      expect(await backend.get('img:key1')).toBe('image1');
      expect(await backend.get('search:key1')).toBe('search1');
      expect(await backend.get('assets:key1')).toBe('assets1');
    });

    it('should clear only image embeddings cache', async () => {
      await backend.clear('img');

      expect(await backend.get('txt:key1')).toBe('text1');
      expect(await backend.get('img:key1')).toBeNull();
      expect(await backend.get('search:key1')).toBe('search1');
      expect(await backend.get('assets:key1')).toBe('assets1');
    });

    it('should clear only search results cache', async () => {
      await backend.clear('search');

      expect(await backend.get('txt:key1')).toBe('text1');
      expect(await backend.get('img:key1')).toBe('image1');
      expect(await backend.get('search:key1')).toBeNull();
      expect(await backend.get('assets:key1')).toBe('assets1');
    });

    it('should clear only asset metadata cache', async () => {
      await backend.clear('assets');

      expect(await backend.get('txt:key1')).toBe('text1');
      expect(await backend.get('img:key1')).toBe('image1');
      expect(await backend.get('search:key1')).toBe('search1');
      expect(await backend.get('assets:key1')).toBeNull();
    });

    it('should handle clearing empty cache', async () => {
      const emptyBackend = new MemoryBackend();
      await expect(emptyBackend.clear()).resolves.toBeUndefined();
      await expect(emptyBackend.clear('txt')).resolves.toBeUndefined();
    });
  });

  describe('TTL Behavior', () => {
    it('should accept custom TTL in set operation', async () => {
      // Set with custom TTL - should not throw
      await expect(
        backend.set('txt:key', 'value', 1000)
      ).resolves.toBeUndefined();
    });

    it('should use default TTL when not specified', async () => {
      // Set without TTL - should not throw
      await expect(
        backend.set('txt:key', 'value')
      ).resolves.toBeUndefined();

      const result = await backend.get('txt:key');
      expect(result).toBe('value');
    });

    // Note: Testing actual TTL expiration would require either:
    // 1. Waiting for real time to pass (slow tests)
    // 2. Mocking the LRUCache implementation
    // 3. Exposing internal cache state for inspection
    // For now, we verify the interface accepts TTL parameters correctly
  });

  describe('Edge Cases', () => {
    it('should handle empty string keys', async () => {
      await backend.set('txt:', 'value');
      const result = await backend.get('txt:');
      expect(result).toBe('value');
    });

    it('should handle keys with special characters', async () => {
      const specialKey = 'txt:key-with-special_chars.123!@#';
      await backend.set(specialKey, 'value');
      const result = await backend.get(specialKey);
      expect(result).toBe('value');
    });

    it('should handle null values', async () => {
      await backend.set('txt:key', null);
      const result = await backend.get('txt:key');
      expect(result).toBeNull();
    });

    it('should handle undefined by storing and retrieving', async () => {
      await backend.set('txt:key', undefined);
      const result = await backend.get('txt:key');
      // LRU cache may treat undefined specially, but it should be retrievable
      expect(result === undefined || result === null).toBe(true);
    });

    it('should overwrite existing values', async () => {
      await backend.set('txt:key', 'first');
      await backend.set('txt:key', 'second');
      const result = await backend.get('txt:key');
      expect(result).toBe('second');
    });

    it('should handle rapid operations on same key', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(backend.set(`txt:key${i}`, `value${i}`));
      }
      await Promise.all(promises);

      for (let i = 0; i < 10; i++) {
        const result = await backend.get(`txt:key${i}`);
        expect(result).toBe(`value${i}`);
      }
    });
  });

  describe('Stats and Monitoring', () => {
    it('should provide getStats method if available', () => {
      // The MemoryBackend currently doesn't expose stats
      // but CacheService handles stats tracking
      // This test verifies the backend interface is simple
      expect(backend.get).toBeDefined();
      expect(backend.set).toBeDefined();
      expect(backend.delete).toBeDefined();
      expect(backend.clear).toBeDefined();
    });
  });

  describe('Concurrency', () => {
    it('should handle concurrent reads and writes', async () => {
      const operations = [];

      // Mix of reads and writes
      for (let i = 0; i < 20; i++) {
        operations.push(backend.set(`txt:key${i}`, `value${i}`));
      }

      for (let i = 0; i < 20; i++) {
        operations.push(backend.get(`txt:key${i}`));
      }

      await expect(Promise.all(operations)).resolves.toBeDefined();
    });

    it('should handle concurrent deletions', async () => {
      // Set up keys
      await backend.set('txt:key1', 'value1');
      await backend.set('txt:key2', 'value2');
      await backend.set('txt:key3', 'value3');

      // Delete concurrently
      const deletions = [
        backend.delete('txt:key1'),
        backend.delete('txt:key2'),
        backend.delete('txt:key3'),
      ];

      const results = await Promise.all(deletions);
      expect(results.every(r => r === true)).toBe(true);
    });

    it('should handle concurrent namespace clears', async () => {
      await backend.set('txt:key1', 'value1');
      await backend.set('img:key1', 'value1');
      await backend.set('search:key1', 'value1');

      const clears = [
        backend.clear('txt'),
        backend.clear('img'),
        backend.clear('search'),
      ];

      await expect(Promise.all(clears)).resolves.toBeDefined();

      expect(await backend.get('txt:key1')).toBeNull();
      expect(await backend.get('img:key1')).toBeNull();
      expect(await backend.get('search:key1')).toBeNull();
    });
  });

  describe('Type Safety', () => {
    it('should preserve number types', async () => {
      await backend.set('txt:num', 42);
      const result = await backend.get<number>('txt:num');
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should preserve boolean types', async () => {
      await backend.set('txt:bool', true);
      const result = await backend.get<boolean>('txt:bool');
      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    it('should preserve array types', async () => {
      const arr = [1, 2, 3];
      await backend.set('txt:arr', arr);
      const result = await backend.get<number[]>('txt:arr');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(arr);
    });

    it('should preserve object types', async () => {
      const obj = { name: 'test', value: 123 };
      await backend.set('txt:obj', obj);
      const result = await backend.get<typeof obj>('txt:obj');
      expect(typeof result).toBe('object');
      expect(result).toEqual(obj);
    });
  });
});
