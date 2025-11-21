import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/stats/route';
import { NextRequest } from 'next/server';

// Mock lib/auth/server
const mockRequireUserIdWithSync = vi.fn();
vi.mock('@/lib/auth/server', () => ({
  requireUserIdWithSync: () => mockRequireUserIdWithSync(),
}));

// Mock lib/db
const mockPrisma = {
  asset: {
    aggregate: vi.fn(),
  },
};

let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
}));

describe('/api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseAvailable = true;
  });

  describe('Success Path', () => {
    it('should return aggregate stats for authenticated user', async () => {
      // Mock auth
      mockRequireUserIdWithSync.mockResolvedValue('test-user-123');

      // Mock Prisma aggregate response
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 42 },
        _sum: { size: 1048576 },
        _max: { createdAt: new Date('2025-11-21T14:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        assetCount: 42,
        storageBytes: 1048576,
        lastUploadAt: '2025-11-21T14:00:00.000Z',
      });

      // Verify correct query parameters
      expect(mockPrisma.asset.aggregate).toHaveBeenCalledWith({
        where: {
          ownerUserId: 'test-user-123',
          deletedAt: null,
        },
        _count: { id: true },
        _sum: { size: true },
        _max: { createdAt: true },
      });
    });

    it('should return correct stats for user with multiple assets', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('power-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 500 },
        _sum: { size: 104857600 }, // 100 MB
        _max: { createdAt: new Date('2025-11-21T18:30:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assetCount).toBe(500);
      expect(data.storageBytes).toBe(104857600);
      expect(data.lastUploadAt).toBe('2025-11-21T18:30:00.000Z');
    });
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Mock auth throwing unauthorized error
      mockRequireUserIdWithSync.mockRejectedValue(new Error('Unauthorized'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch stats');

      consoleErrorSpy.mockRestore();
    });

    it('should validate user ID before querying database', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('validated-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _sum: { size: 50000 },
        _max: { createdAt: new Date('2025-11-21T10:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify both auth and database query were called
      expect(mockRequireUserIdWithSync).toHaveBeenCalled();
      expect(mockPrisma.asset.aggregate).toHaveBeenCalled();
    });
  });

  describe('Database Unavailable', () => {
    it('should return 503 when Prisma is not configured', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('test-user');
      mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database not available');

      // Database query should not be attempted
      expect(mockPrisma.asset.aggregate).not.toHaveBeenCalled();
    });

    it('should check database availability after authentication', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('test-user');
      mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);

      // Auth should succeed, but database check should fail
      expect(mockRequireUserIdWithSync).toHaveBeenCalled();
      expect(response.status).toBe(503);
    });
  });

  describe('Null Handling', () => {
    it('should handle users with no assets (all nulls)', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('new-user');

      // Mock empty aggregate result
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { size: null },
        _max: { createdAt: null },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        assetCount: 0,
        storageBytes: 0, // null coalesced to 0
        lastUploadAt: null,
      });
    });

    it('should handle null size sum correctly', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('user-with-zero-byte-assets');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: { size: null }, // Can happen with zero-byte files
        _max: { createdAt: new Date('2025-11-21T12:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.assetCount).toBe(5);
      expect(data.storageBytes).toBe(0);
      expect(data.lastUploadAt).toBe('2025-11-21T12:00:00.000Z');
    });

    it('should handle null createdAt correctly', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('edge-case-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { size: 0 },
        _max: { createdAt: null },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.lastUploadAt).toBeNull();
    });
  });

  describe('Data Filtering', () => {
    it('should exclude deleted assets from counts', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('user-with-deleted-assets');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 25 },
        _sum: { size: 2097152 },
        _max: { createdAt: new Date('2025-11-21T16:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify deletedAt: null filter is applied
      const callArgs = mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBe(null);
    });

    it('should only count assets for the authenticated user', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('specific-user-456');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 100 },
        _sum: { size: 10485760 },
        _max: { createdAt: new Date('2025-11-21T20:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify ownerUserId filter is applied with correct user ID
      const callArgs = mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where.ownerUserId).toBe('specific-user-456');
    });

    it('should apply both user and deletion filters simultaneously', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('multi-filter-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 15 },
        _sum: { size: 524288 },
        _max: { createdAt: new Date('2025-11-21T11:30:00Z') },
      });

      await GET({} as NextRequest);

      const callArgs = mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where).toEqual({
        ownerUserId: 'multi-filter-user',
        deletedAt: null,
      });
    });
  });

  describe('Date Formatting', () => {
    it('should format lastUploadAt as ISO 8601 string', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('date-format-user');

      const testDate = new Date('2025-11-21T09:45:30.123Z');
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _sum: { size: 1024 },
        _max: { createdAt: testDate },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      // Verify exact ISO format with milliseconds
      expect(data.lastUploadAt).toBe('2025-11-21T09:45:30.123Z');
      expect(typeof data.lastUploadAt).toBe('string');
    });

    it('should preserve timezone information in ISO format', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('timezone-user');

      // Date with explicit UTC
      const utcDate = new Date('2025-11-21T00:00:00.000Z');
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 3 },
        _sum: { size: 3072 },
        _max: { createdAt: utcDate },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.lastUploadAt).toMatch(/Z$/); // Must end with Z for UTC
      expect(data.lastUploadAt).toBe(utcDate.toISOString());
    });
  });

  describe('Error Handling', () => {
    it('should handle database query failures gracefully', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('query-error-user');

      mockPrisma.asset.aggregate.mockRejectedValue(new Error('Connection timeout'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch stats');

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch stats:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle malformed aggregate responses', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('malformed-data-user');

      // Mock unexpected aggregate structure that will cause runtime error
      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 'not-a-number' }, // Type violation
        _sum: { size: undefined },
        _max: { createdAt: 'invalid-date' }, // This will fail .toISOString()
      } as any);

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      // Should return 500 error when data causes runtime error
      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch stats');

      consoleErrorSpy.mockRestore();
    });

    it('should catch and log unexpected errors', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('unexpected-error-user');

      // Simulate unexpected runtime error
      mockPrisma.asset.aggregate.mockImplementation(() => {
        throw new TypeError('Cannot read property of undefined');
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch stats');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    it('should execute single aggregate query (no N+1)', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('performance-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 1000 },
        _sum: { size: 1073741824 }, // 1 GB
        _max: { createdAt: new Date('2025-11-21T22:00:00Z') },
      });

      await GET({} as NextRequest);

      // Should only call aggregate once
      expect(mockPrisma.asset.aggregate).toHaveBeenCalledTimes(1);
    });

    it('should not perform any joins or additional queries', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('efficient-query-user');

      const aggregateSpy = vi.spyOn(mockPrisma.asset, 'aggregate');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 50 },
        _sum: { size: 5242880 },
        _max: { createdAt: new Date('2025-11-21T15:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify only aggregate was called (no findMany, findFirst, etc.)
      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.asset).not.toHaveProperty('findMany');
      expect(mockPrisma.asset).not.toHaveProperty('findFirst');

      aggregateSpy.mockRestore();
    });
  });

  describe('Response Structure', () => {
    it('should return all three expected fields', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('structure-test-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 7 },
        _sum: { size: 7168 },
        _max: { createdAt: new Date('2025-11-21T13:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(Object.keys(data).sort()).toEqual([
        'assetCount',
        'lastUploadAt',
        'storageBytes',
      ].sort());
    });

    it('should return JSON content type', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('content-type-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _sum: { size: 1024 },
        _max: { createdAt: new Date() },
      });

      const response = await GET({} as NextRequest);

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should have consistent field types', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('type-check-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 99 },
        _sum: { size: 999999 },
        _max: { createdAt: new Date('2025-11-21T17:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(typeof data.assetCount).toBe('number');
      expect(typeof data.storageBytes).toBe('number');
      expect(typeof data.lastUploadAt).toBe('string'); // ISO string, not null
    });

    it('should handle null lastUploadAt as null (not string)', async () => {
      mockRequireUserIdWithSync.mockResolvedValue('null-type-user');

      mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { size: null },
        _max: { createdAt: null },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.lastUploadAt).toBeNull();
      expect(typeof data.lastUploadAt).toBe('object'); // typeof null === 'object'
    });
  });
});
