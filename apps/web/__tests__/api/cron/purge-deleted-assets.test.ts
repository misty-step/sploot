import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/purge-deleted-assets/route';
import { NextRequest } from 'next/server';
import * as blobModule from '@vercel/blob';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock lib/db
const mockPrisma = {
  asset: {
    findMany: vi.fn(),
    delete: vi.fn(),
  },
};

let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
  get databaseAvailable() {
    return mockDatabaseAvailable;
  },
}));

// Mock @vercel/blob
vi.mock('@vercel/blob', () => ({
  del: vi.fn(),
}));

describe('/api/cron/purge-deleted-assets', () => {
  const CRON_SECRET = 'test-cron-secret';
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // Helper to create a date N days ago
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    // Set up environment
    process.env.CRON_SECRET = CRON_SECRET;
    mockDatabaseAvailable = true;

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock: return valid headers
    mockHeaders.mockReturnValue({
      get: vi.fn((key: string) => {
        if (key === 'authorization') return `Bearer ${CRON_SECRET}`;
        return null;
      }),
    });

    // Default: deleteBlob succeeds
    vi.mocked(blobModule.del).mockResolvedValue(undefined);

    // Default: delete succeeds
    mockPrisma.asset.delete.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('Authentication', () => {
    it('should return 500 when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('CRON_SECRET not configured');
    });

    it('should return 401 when authorization header is missing', async () => {
      mockHeaders.mockReturnValue({
        get: vi.fn(() => null),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 when authorization header is incorrect', async () => {
      mockHeaders.mockReturnValue({
        get: vi.fn((key: string) => {
          if (key === 'authorization') return 'Bearer wrong-secret';
          return null;
        }),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 503 when database is unavailable', async () => {
      mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database unavailable');
    });
  });

  describe('Asset Purging', () => {
    it('should return success when no assets need purging', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('No assets need purging');
      expect(data.stats.totalFound).toBe(0);
      expect(data.stats.purgedCount).toBe(0);
      expect(data.totalTime).toBeDefined();
    });

    it('should only delete assets where deletedAt > 30 days ago', async () => {
      // Query params should filter by deletedAt
      mockPrisma.asset.findMany.mockResolvedValue([]);

      await GET({} as NextRequest);

      // Verify the query includes correct filtering
      const callArgs = mockPrisma.asset.findMany.mock.calls[0][0];
      expect(callArgs.where.deletedAt.not).toBe(null);
      expect(callArgs.where.deletedAt.lt).toBeInstanceOf(Date);

      // Verify the cutoff is approximately 30 days ago (within 1 second tolerance)
      const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
      const cutoffTime = callArgs.where.deletedAt.lt.getTime();
      expect(Math.abs(cutoffTime - thirtyDaysAgo)).toBeLessThan(1000);
    });

    it('should successfully purge assets older than 30 days', async () => {
      const mockAssets = [
        {
          id: 'asset-old-1',
          blobUrl: 'https://blob.vercel-storage.com/old-1.jpg',
          thumbnailUrl: 'https://blob.vercel-storage.com/old-1-thumb.jpg',
          pathname: 'old-1.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-old-2',
          blobUrl: 'https://blob.vercel-storage.com/old-2.jpg',
          thumbnailUrl: null,
          pathname: 'old-2.jpg',
          deletedAt: daysAgo(31),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.totalFound).toBe(2);
      expect(data.stats.purgedCount).toBe(2);
      expect(data.stats.failedCount).toBe(0);
      expect(data.stats.blobsDeleted).toBe(3); // 2 main + 1 thumbnail

      // Verify blobs were deleted
      expect(blobModule.del).toHaveBeenCalledTimes(3);
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-1.jpg');
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-1-thumb.jpg');
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/old-2.jpg');

      // Verify database records were deleted
      expect(mockPrisma.asset.delete).toHaveBeenCalledTimes(2);
      expect(mockPrisma.asset.delete).toHaveBeenCalledWith({ where: { id: 'asset-old-1' } });
      expect(mockPrisma.asset.delete).toHaveBeenCalledWith({ where: { id: 'asset-old-2' } });
    });

    it('should handle blob deletion failures gracefully', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          thumbnailUrl: null,
          pathname: 'test.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Blob deletion fails but asset purge should continue
      vi.mocked(blobModule.del).mockRejectedValue(new Error('Blob not found'));

      // Suppress console.warn
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.purgedCount).toBe(1); // Still purged from database
      expect(data.stats.failedCount).toBe(0); // Blob failure doesn't count as asset failure
      expect(data.stats.blobsDeleted).toBe(0); // No blobs deleted successfully

      // Database record should still be deleted
      expect(mockPrisma.asset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete blob'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should continue processing after single asset failure', async () => {
      const mockAssets = [
        {
          id: 'asset-fail',
          blobUrl: 'https://blob.vercel-storage.com/fail.jpg',
          thumbnailUrl: null,
          pathname: 'fail.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-success',
          blobUrl: 'https://blob.vercel-storage.com/success.jpg',
          thumbnailUrl: null,
          pathname: 'success.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // First delete fails, second succeeds
      mockPrisma.asset.delete
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({});

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalFound).toBe(2);
      expect(data.stats.purgedCount).toBe(1); // Only second succeeded
      expect(data.stats.failedCount).toBe(1);
      expect(data.stats.errors).toHaveLength(1);
      expect(data.stats.errors[0]).toEqual({
        assetId: 'asset-fail',
        error: 'Database error',
      });

      // Both deletes should have been attempted
      expect(mockPrisma.asset.delete).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });

    it('should return correct counts (purgedCount, failedCount, blobsDeleted)', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/1.jpg',
          thumbnailUrl: 'https://blob.vercel-storage.com/1-thumb.jpg',
          pathname: '1.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-2',
          blobUrl: 'https://blob.vercel-storage.com/2.jpg',
          thumbnailUrl: 'https://blob.vercel-storage.com/2-thumb.jpg',
          pathname: '2.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats).toMatchObject({
        totalFound: 2,
        purgedCount: 2,
        failedCount: 0,
        blobsDeleted: 4, // 2 main + 2 thumbnails
      });

      expect(data.stats.successRate).toBe(100);
      expect(data.message).toBe('Purged 2 of 2 assets');
    });

    it('should handle empty result set (no assets to purge)', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('No assets need purging');
      expect(data.stats.totalFound).toBe(0);

      // No deletes should be attempted
      expect(blobModule.del).not.toHaveBeenCalled();
      expect(mockPrisma.asset.delete).not.toHaveBeenCalled();
    });

    it('should include cutoffDate in response when assets are purged', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          thumbnailUrl: null,
          pathname: 'test.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.cutoffDate).toBeDefined();
      expect(new Date(data.stats.cutoffDate).getTime()).toBeLessThan(Date.now());

      // Cutoff should be approximately 30 days ago
      const cutoffTime = new Date(data.stats.cutoffDate).getTime();
      const thirtyDaysAgo = Date.now() - THIRTY_DAYS_MS;
      expect(Math.abs(cutoffTime - thirtyDaysAgo)).toBeLessThan(2000); // 2s tolerance
    });

    it('should calculate success rate correctly', async () => {
      const mockAssets = Array.from({ length: 10 }, (_, i) => ({
        id: `asset-${i}`,
        blobUrl: `https://blob.vercel-storage.com/${i}.jpg`,
        thumbnailUrl: null,
        pathname: `${i}.jpg`,
        deletedAt: daysAgo(35),
        ownerUserId: 'user-1',
      }));

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Make 3 fail
      mockPrisma.asset.delete
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({});

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalFound).toBe(10);
      expect(data.stats.purgedCount).toBe(7);
      expect(data.stats.failedCount).toBe(3);
      expect(data.stats.successRate).toBe(70); // 7/10 = 70%

      consoleErrorSpy.mockRestore();
    });

    it('should delete both blobUrl and thumbnailUrl when present', async () => {
      const mockAssets = [
        {
          id: 'asset-with-thumb',
          blobUrl: 'https://blob.vercel-storage.com/main.jpg',
          thumbnailUrl: 'https://blob.vercel-storage.com/thumb.jpg',
          pathname: 'main.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      await GET({} as NextRequest);

      expect(blobModule.del).toHaveBeenCalledTimes(2);
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/main.jpg');
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/thumb.jpg');
    });

    it('should only delete blobUrl when thumbnailUrl is null', async () => {
      const mockAssets = [
        {
          id: 'asset-no-thumb',
          blobUrl: 'https://blob.vercel-storage.com/main.jpg',
          thumbnailUrl: null,
          pathname: 'main.jpg',
          deletedAt: daysAgo(35),
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      await GET({} as NextRequest);

      expect(blobModule.del).toHaveBeenCalledTimes(1);
      expect(blobModule.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/main.jpg');
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock development environment to test error details
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      mockPrisma.asset.findMany.mockRejectedValue(new Error('Database connection failed'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to purge deleted assets');
      expect(data.details).toBe('Database connection failed'); // Only present in development
      expect(data.stats).toBeDefined();

      consoleErrorSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
