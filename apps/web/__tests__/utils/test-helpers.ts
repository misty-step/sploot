import { NextRequest } from 'next/server';
import { vi } from 'vitest';

// Mock Prisma client
export const mockPrisma = () => {
  const mockAsset = {
    id: 'asset-123',
    ownerUserId: 'test-user-id',
    blobUrl: 'https://example.blob.vercel-storage.com/test.jpg',
    pathname: 'test.jpg',
    mime: 'image/jpeg',
    size: 1024000,
    checksumSha256: 'mock-checksum',
    width: 1920,
    height: 1080,
    favorite: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    phash: null,
  };

  const mockAssetEmbedding = {
    id: 'embedding-123',
    assetId: 'asset-123',
    imageEmbedding: Array(1152).fill(0.1),
    createdAt: new Date(),
  };

  return {
    asset: {
      create: vi.fn<() => Promise<any>>().mockResolvedValue(mockAsset),
      findFirst: vi.fn<() => Promise<any>>().mockResolvedValue(null),
      findMany: vi.fn<() => Promise<any>>().mockResolvedValue([mockAsset]),
      findUnique: vi.fn<() => Promise<any>>().mockResolvedValue(mockAsset),
      update: vi.fn<() => Promise<any>>().mockResolvedValue({ ...mockAsset, favorite: true }),
      delete: vi.fn<() => Promise<any>>().mockResolvedValue(mockAsset),
      count: vi.fn<() => Promise<number>>().mockResolvedValue(10),
    },
    assetEmbedding: {
      create: vi.fn<() => Promise<any>>().mockResolvedValue(mockAssetEmbedding),
      findFirst: vi.fn<() => Promise<any>>().mockResolvedValue(null),
      findUnique: vi.fn<() => Promise<any>>().mockResolvedValue(null),
      update: vi.fn<() => Promise<any>>().mockResolvedValue(mockAssetEmbedding),
      upsert: vi.fn<() => Promise<any>>().mockResolvedValue(mockAssetEmbedding),
    },
    assetTag: {
      findMany: vi.fn<() => Promise<any>>().mockResolvedValue([]),
      deleteMany: vi.fn<() => Promise<any>>().mockResolvedValue({ count: 0 }),
      create: vi.fn<() => Promise<any>>().mockResolvedValue({
        id: 'tag-123',
        assetId: 'asset-123',
        tagId: 'tag-456',
      }),
    },
    tag: {
      findFirst: vi.fn<() => Promise<any>>().mockResolvedValue(null),
      create: vi.fn<() => Promise<any>>().mockResolvedValue({
        id: 'tag-456',
        name: 'test-tag',
        userId: 'test-user-id',
      }),
    },
    searchLog: {
      create: vi.fn<() => Promise<any>>().mockResolvedValue({
        id: 'log-123',
        userId: 'test-user-id',
        query: 'test query',
        resultCount: 5,
        queryTime: 100,
        createdAt: new Date(),
      }),
      findMany: vi.fn<() => Promise<any>>().mockResolvedValue([]),
      groupBy: vi.fn<() => Promise<any>>().mockResolvedValue([]),
    },
    $queryRaw: vi.fn<() => Promise<any>>().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn<() => Promise<any>>().mockResolvedValue([]),
    $transaction: vi.fn<(callback: any) => Promise<any>>().mockImplementation((callback) =>
      callback({
        asset: {
          create: vi.fn<() => Promise<any>>().mockResolvedValue(mockAsset),
          update: vi.fn<() => Promise<any>>().mockResolvedValue(mockAsset),
        },
        assetEmbedding: {
          create: vi.fn<() => Promise<any>>().mockResolvedValue(mockAssetEmbedding),
        },
      })
    ),
  };
};

// Create mock NextRequest
export const createMockRequest = (
  method: string,
  body?: any,
  headers?: Record<string, string>,
  searchParams?: Record<string, string>
): NextRequest => {
  const url = new URL('http://localhost:3000/api/test');

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const request = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Mock json() method
  if (body) {
    (request as any).json = vi.fn<() => Promise<any>>().mockResolvedValue(body);
  }

  return request;
};

// Mock blob storage functions
export const mockBlobStorage = () => {
  return {
    put: vi.fn<() => Promise<any>>().mockResolvedValue({
      url: 'https://example.blob.vercel-storage.com/test.jpg',
      pathname: 'test.jpg',
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
    }),
    del: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    head: vi.fn<() => Promise<any>>().mockResolvedValue({
      size: 1024000,
      uploadedAt: new Date(),
      pathname: 'test.jpg',
      contentType: 'image/jpeg',
    }),
    list: vi.fn<() => Promise<any>>().mockResolvedValue({
      blobs: [],
      cursor: null,
      hasMore: false,
    }),
  };
};

// Mock embedding service
export const mockEmbeddingService = () => {
  return {
    embedText: vi.fn<() => Promise<any>>().mockResolvedValue({
      embedding: Array(1152).fill(0.1),
      model: 'siglip-large',
      dimension: 1152,
      processingTime: 100,
    }),
    embedImage: vi.fn<() => Promise<any>>().mockResolvedValue({
      embedding: Array(1152).fill(0.1),
      model: 'siglip-large',
      dimension: 1152,
      processingTime: 150,
    }),
    embedBatch: vi.fn<() => Promise<any[]>>().mockResolvedValue([
      {
        embedding: Array(1152).fill(0.1),
        model: 'siglip-large',
        dimension: 1152,
        processingTime: 100,
      },
    ]),
  };
};

// Mock cache service
export const mockCacheService = () => {
  return {
    getTextEmbedding: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setTextEmbedding: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getImageEmbedding: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setImageEmbedding: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getSearchResults: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setSearchResults: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateUserData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getUserAssetCount: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setUserAssetCount: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    isHealthy: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    getStats: vi.fn<() => Promise<any>>().mockResolvedValue({
      enabled: true,
      healthy: true,
    }),
  };
};

// Mock multi-layer cache
export const mockMultiLayerCache = () => {
  return {
    getTextEmbedding: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setTextEmbedding: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getImageEmbedding: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setImageEmbedding: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getSearchResults: vi.fn<() => Promise<any>>().mockResolvedValue(null),
    setSearchResults: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateUserData: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    warmCache: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startAutoWarming: vi.fn<() => void>(),
    stopAutoWarming: vi.fn<() => void>(),
    getStats: vi.fn<() => any>().mockReturnValue({
      hits: 150,
      misses: 30,
      totalRequests: 180,
      hitRate: 83.33,
      avgLatency: 5.2,
      lastReset: new Date(),
    }),
    isHealthy: vi.fn<() => Promise<any>>().mockResolvedValue({
      l1: true,
      l2: true,
      stats: {
        hits: 150,
        misses: 30,
        totalRequests: 180,
        hitRate: 83.33,
        avgLatency: 5.2,
        lastReset: new Date(),
      },
    }),
    clearL1Cache: vi.fn<() => void>(),
    clearL2Cache: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    clearAllCaches: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    resetStats: vi.fn<() => void>(),
  };
};

// Helper to parse response
export const parseResponse = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Wait for a specific queue event with timeout
 * @param queue - EmbeddingQueueManager instance
 * @param predicate - Function to test if event matches what we're waiting for
 * @param timeout - Max wait time in ms (default 5000)
 * @returns Promise that resolves with the matching event
 */
export const waitForQueueEvent = (
  queue: ReturnType<typeof import('@/lib/embedding-queue').getEmbeddingQueueManager>,
  predicate: (event: import('@/lib/embedding-queue').QueueEvent) => boolean,
  timeout = 5000
): Promise<import('@/lib/embedding-queue').QueueEvent> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for queue event after ${timeout}ms`)),
      timeout
    );

    const unsubscribe = queue.subscribe((event) => {
      if (predicate(event)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      }
    });
  });
};

/**
 * Wait for queue to complete processing all items
 * @param queue - EmbeddingQueueManager instance
 * @param timeout - Max wait time in ms (default 10000)
 */
export const waitForQueueIdle = async (
  queue: ReturnType<typeof import('@/lib/embedding-queue').getEmbeddingQueueManager>,
  timeout = 10000
): Promise<void> => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = queue.getStatus();
    if (status.queued === 0 && status.processing === 0) {
      return; // Queue is idle
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Queue did not become idle within ${timeout}ms`);
};

// Add a dummy test to prevent Jest from complaining
describe('test-helpers', () => {
  it('exports helper functions', () => {
    expect(createMockRequest).toBeDefined();
    expect(mockPrisma).toBeDefined();
    expect(mockEmbeddingService).toBeDefined();
    expect(mockMultiLayerCache).toBeDefined();
    expect(waitForQueueEvent).toBeDefined();
    expect(waitForQueueIdle).toBeDefined();
  });
});
