import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/audit-assets/route';
import { NextRequest } from 'next/server';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock lib/db
const mockPrisma = {
  asset: {
    findMany: vi.fn(),
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

// Mock global fetch for blob URL checks
global.fetch = vi.fn();

describe('/api/cron/audit-assets', () => {
  const CRON_SECRET = 'test-cron-secret';

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

  describe('Asset Auditing', () => {
    it('should return success when no assets exist', async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('No assets to audit');
      expect(data.stats.totalAssets).toBe(0);
      expect(data.totalTime).toBeDefined();
    });

    it('should correctly identify valid assets', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/valid-1.jpg',
          pathname: 'valid-1.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-2',
          blobUrl: 'https://blob.vercel-storage.com/valid-2.jpg',
          pathname: 'valid-2.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Mock fetch to return 200 OK for all assets
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.totalAssets).toBe(2);
      expect(data.stats.validCount).toBe(2);
      expect(data.stats.brokenCount).toBe(0);
      expect(data.stats.errorCount).toBe(0);
      expect(data.stats.usersAffected).toBe(0);
      expect(data.alert).toBeNull();
    });

    it('should correctly identify broken assets (404)', async () => {
      const mockAssets = [
        {
          id: 'asset-broken-1',
          blobUrl: 'https://blob.vercel-storage.com/broken-1.jpg',
          pathname: 'broken-1.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-broken-2',
          blobUrl: 'https://blob.vercel-storage.com/broken-2.jpg',
          pathname: 'broken-2.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Mock fetch to return 404 Not Found
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.totalAssets).toBe(2);
      expect(data.stats.validCount).toBe(0);
      expect(data.stats.brokenCount).toBe(2);
      expect(data.stats.brokenAssetIds).toEqual(['asset-broken-1', 'asset-broken-2']);
      expect(data.stats.usersAffected).toBe(1);
    });

    it('should track broken assets per user', async () => {
      const mockAssets = [
        {
          id: 'asset-u1-1',
          blobUrl: 'https://blob.vercel-storage.com/u1-1.jpg',
          pathname: 'u1-1.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-u1-2',
          blobUrl: 'https://blob.vercel-storage.com/u1-2.jpg',
          pathname: 'u1-2.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-u2-1',
          blobUrl: 'https://blob.vercel-storage.com/u2-1.jpg',
          pathname: 'u2-1.jpg',
          ownerUserId: 'user-2',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // All broken
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.usersAffected).toBe(2);
      expect(data.affectedUsers).toHaveLength(2);

      const user1 = data.affectedUsers.find((u: any) => u.userId === 'user-1');
      const user2 = data.affectedUsers.find((u: any) => u.userId === 'user-2');

      expect(user1.brokenCount).toBe(2);
      expect(user2.brokenCount).toBe(1);
    });

    it('should send alert when >10 broken assets found', async () => {
      // Create 12 broken assets
      const mockAssets = Array.from({ length: 12 }, (_, i) => ({
        id: `asset-${i}`,
        blobUrl: `https://blob.vercel-storage.com/asset-${i}.jpg`,
        pathname: `asset-${i}.jpg`,
        ownerUserId: 'user-1',
      }));

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // All broken
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      // Spy on console.error to verify alert
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.brokenCount).toBe(12);
      expect(data.alert).toBe('Critical: >10 broken blobs detected');

      // Verify console.error was called with alert message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 ALERT: 12 broken blobs detected')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not send alert when ≤10 broken assets found', async () => {
      // Create exactly 10 broken assets
      const mockAssets = Array.from({ length: 10 }, (_, i) => ({
        id: `asset-${i}`,
        blobUrl: `https://blob.vercel-storage.com/asset-${i}.jpg`,
        pathname: `asset-${i}.jpg`,
        ownerUserId: 'user-1',
      }));

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // All broken
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.brokenCount).toBe(10);
      expect(data.alert).toBeNull();
    });

    it('should handle fetch errors gracefully', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/asset-1.jpg',
          pathname: 'asset-1.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-2',
          blobUrl: 'https://blob.vercel-storage.com/asset-2.jpg',
          pathname: 'asset-2.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Mock fetch to throw network error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalAssets).toBe(2);
      expect(data.stats.validCount).toBe(0);
      expect(data.stats.brokenCount).toBe(0);
      expect(data.stats.errorCount).toBe(2); // Both assets errored

      // Verify errors were logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error checking asset'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle mixed results (valid, broken, error)', async () => {
      const mockAssets = [
        {
          id: 'asset-valid',
          blobUrl: 'https://blob.vercel-storage.com/valid.jpg',
          pathname: 'valid.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-broken',
          blobUrl: 'https://blob.vercel-storage.com/broken.jpg',
          pathname: 'broken.jpg',
          ownerUserId: 'user-1',
        },
        {
          id: 'asset-error',
          blobUrl: 'https://blob.vercel-storage.com/error.jpg',
          pathname: 'error.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);

      // Mock different responses for each fetch
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true, status: 200 }) // valid
        .mockResolvedValueOnce({ ok: false, status: 404 }) // broken
        .mockRejectedValueOnce(new Error('Timeout')); // error

      // Suppress console.error for this test
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.stats.totalAssets).toBe(3);
      expect(data.stats.validCount).toBe(1);
      expect(data.stats.brokenCount).toBe(1);
      expect(data.stats.errorCount).toBe(1);
      expect(data.stats.brokenAssetIds).toEqual(['asset-broken']);

      consoleErrorSpy.mockRestore();
    });

    it('should only audit non-deleted assets', async () => {
      // Verify the query includes deletedAt: null filter
      mockPrisma.asset.findMany.mockResolvedValue([]);

      await GET({} as NextRequest);

      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: {
          id: true,
          blobUrl: true,
          pathname: true,
          ownerUserId: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should use HEAD request for blob checks', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          pathname: 'test.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

      await GET({} as NextRequest);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://blob.vercel-storage.com/test.jpg',
        expect.objectContaining({
          method: 'HEAD',
        })
      );
    });

    it('should include timeout in blob checks', async () => {
      const mockAssets = [
        {
          id: 'asset-1',
          blobUrl: 'https://blob.vercel-storage.com/test.jpg',
          pathname: 'test.jpg',
          ownerUserId: 'user-1',
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(mockAssets);
      (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

      await GET({} as NextRequest);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(Object), // AbortSignal.timeout(5000)
        })
      );
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
      expect(data.error).toBe('Failed to audit assets');
      expect(data.details).toBe('Database connection failed'); // Only present in development
      expect(data.stats).toBeDefined();

      consoleErrorSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
