import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    textEmbeddingCache: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { CacheService } from '@/lib/cache/CacheService';

describe('text embedding persistent L2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('falls back to the persistent store when L1 misses (fresh instance)', async () => {
    const embedding = [0.1, 0.2, 0.3];
    mocks.findUnique.mockResolvedValue({
      embedding,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Fresh CacheService = empty in-memory L1, like a cold serverless instance.
    const cache = new CacheService();
    await expect(cache.getTextEmbedding('funny cat', 'clip-model')).resolves.toEqual(embedding);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);

    // L1 hydrated: a second read does not touch the persistent store again.
    await expect(cache.getTextEmbedding('funny cat', 'clip-model')).resolves.toEqual(embedding);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });

  it('treats expired persistent rows as misses', async () => {
    mocks.findUnique.mockResolvedValue({
      embedding: [0.5],
      expiresAt: new Date(Date.now() - 1),
    });

    const cache = new CacheService();
    await expect(cache.getTextEmbedding('stale', 'clip-model')).resolves.toBeNull();
  });

  it('persists writes and prunes expired rows opportunistically', async () => {
    const cache = new CacheService();
    await cache.setTextEmbedding('funny cat', [0.9, 0.8], 'clip-model');

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mocks.upsert.mock.calls[0][0];
    expect(upsertArgs.create.model).toBe('clip-model');
    expect(upsertArgs.create.embedding).toEqual([0.9, 0.8]);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });

  it('keys by model and normalized query so model swaps and whitespace variants behave', async () => {
    const cache = new CacheService();
    await cache.setTextEmbedding('  Funny   CAT ', [1], 'model-a');

    // Same semantic query, same model -> hit from L1 without touching L2.
    await expect(cache.getTextEmbedding('funny cat', 'model-a')).resolves.toEqual([1]);
    expect(mocks.findUnique).not.toHaveBeenCalled();

    // Different model -> miss.
    await expect(cache.getTextEmbedding('funny cat', 'model-b')).resolves.toBeNull();
  });

  it('degrades to L1-only when the database throws', async () => {
    mocks.findUnique.mockRejectedValue(new Error('db down'));
    mocks.upsert.mockRejectedValue(new Error('db down'));

    const cache = new CacheService();
    await expect(cache.setTextEmbedding('q', [1], 'm')).resolves.toBeUndefined();
    await expect(cache.getTextEmbedding('q', 'm')).resolves.toEqual([1]);
  });
});
