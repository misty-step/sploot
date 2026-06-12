import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/stats/route';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  mockRequireUserIdWithSync: vi.fn(),
  mockPrisma: {
    asset: {
      aggregate: vi.fn(),
    },
  },
  mockGetStorageQuotaSnapshot: vi.fn(),
  mockGetBillingPlanSnapshot: vi.fn(),
  mockDatabaseAvailable: true,
}));

vi.mock('@/lib/auth/server', () => ({
  requireUserIdWithSync: () => mocks.mockRequireUserIdWithSync(),
}));

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mocks.mockDatabaseAvailable ? mocks.mockPrisma : null;
  },
}));

vi.mock('@/lib/quota/storage-quota-policy', () => ({
  getStorageQuotaSnapshot: mocks.mockGetStorageQuotaSnapshot,
}));

vi.mock('@/lib/billing/subscription-sync', () => ({
  getBillingPlanSnapshot: mocks.mockGetBillingPlanSnapshot,
}));

describe('/api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockDatabaseAvailable = true;
    mocks.mockGetStorageQuotaSnapshot.mockResolvedValue({
      usedBytes: 0,
      limitBytes: 1073741824,
      remainingBytes: 1073741824,
      reservedBytes: 0,
    });
    mocks.mockGetBillingPlanSnapshot.mockResolvedValue({
      plan: 'free',
      limitBytes: 1073741824,
      billingStatus: 'none',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      billingCurrentPeriodEnd: null,
    });
  });

  describe('Success Path', () => {
    it('should return aggregate stats for authenticated user', async () => {
      // Mock auth
      mocks.mockRequireUserIdWithSync.mockResolvedValue('test-user-123');

      // Mock Prisma aggregate response
      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
        storageLimitBytes: 1073741824,
        storageRemainingBytes: 1072693248,
        storageUsagePercent: 0.1,
        plan: 'free',
        planName: 'Free',
        billingStatus: 'none',
        billingCurrentPeriodEnd: null,
        lastUploadAt: '2025-11-21T14:00:00.000Z',
      });

      // Verify correct query parameters
      expect(mocks.mockPrisma.asset.aggregate).toHaveBeenCalledWith({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('power-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 500 },
        _sum: { size: 104857600 }, // 100 MB
        _max: { createdAt: new Date('2025-11-21T18:30:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.assetCount).toBe(500);
      expect(data.storageBytes).toBe(104857600);
      expect(data.storageLimitBytes).toBe(1073741824);
      expect(data.storageRemainingBytes).toBe(968884224);
      expect(data.storageUsagePercent).toBe(9.8);
      expect(data.plan).toBe('free');
      expect(data.planName).toBe('Free');
      expect(data.lastUploadAt).toBe('2025-11-21T18:30:00.000Z');
    });

    it('should return active billing plan fields for paid users', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('paid-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 20 },
        _sum: { size: 2 * 1024 * 1024 * 1024 },
        _max: { createdAt: new Date('2026-06-11T18:30:00Z') },
      });
      mocks.mockGetStorageQuotaSnapshot.mockResolvedValue({
        usedBytes: 2 * 1024 * 1024 * 1024,
        limitBytes: 20 * 1024 * 1024 * 1024,
        remainingBytes: 18 * 1024 * 1024 * 1024,
        reservedBytes: 0,
      });
      mocks.mockGetBillingPlanSnapshot.mockResolvedValue({
        plan: 'plus',
        limitBytes: 20 * 1024 * 1024 * 1024,
        billingStatus: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_plus',
        billingCurrentPeriodEnd: new Date('2026-07-11T18:30:00Z'),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        storageLimitBytes: 20 * 1024 * 1024 * 1024,
        storageUsagePercent: 10,
        plan: 'plus',
        planName: 'Plus',
        billingStatus: 'active',
        billingCurrentPeriodEnd: '2026-07-11T18:30:00.000Z',
      });
    });
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Mock auth throwing unauthorized error
      mocks.mockRequireUserIdWithSync.mockRejectedValue(new Error('Unauthorized'));

      // Suppress console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');

      consoleErrorSpy.mockRestore();
    });

    it('should validate user ID before querying database', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('validated-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _sum: { size: 50000 },
        _max: { createdAt: new Date('2025-11-21T10:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify both auth and database query were called
      expect(mocks.mockRequireUserIdWithSync).toHaveBeenCalled();
      expect(mocks.mockPrisma.asset.aggregate).toHaveBeenCalled();
    });
  });

  describe('Database Unavailable', () => {
    it('should return 503 when Prisma is not configured', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('test-user');
      mocks.mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database not available');

      // Database query should not be attempted
      expect(mocks.mockPrisma.asset.aggregate).not.toHaveBeenCalled();
    });

    it('should check database availability after authentication', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('test-user');
      mocks.mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);

      // Auth should succeed, but database check should fail
      expect(mocks.mockRequireUserIdWithSync).toHaveBeenCalled();
      expect(response.status).toBe(503);
    });
  });

  describe('Null Handling', () => {
    it('should handle users with no assets (all nulls)', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('new-user');

      // Mock empty aggregate result
      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
        storageLimitBytes: 1073741824,
        storageRemainingBytes: 1073741824,
        storageUsagePercent: 0,
        plan: 'free',
        planName: 'Free',
        billingStatus: 'none',
        billingCurrentPeriodEnd: null,
        lastUploadAt: null,
      });
    });

    it('should handle null size sum correctly', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('user-with-zero-byte-assets');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('edge-case-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('user-with-deleted-assets');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 25 },
        _sum: { size: 2097152 },
        _max: { createdAt: new Date('2025-11-21T16:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify deletedAt: null filter is applied
      const callArgs = mocks.mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBe(null);
    });

    it('should only count assets for the authenticated user', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('specific-user-456');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 100 },
        _sum: { size: 10485760 },
        _max: { createdAt: new Date('2025-11-21T20:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify ownerUserId filter is applied with correct user ID
      const callArgs = mocks.mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where.ownerUserId).toBe('specific-user-456');
    });

    it('should apply both user and deletion filters simultaneously', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('multi-filter-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 15 },
        _sum: { size: 524288 },
        _max: { createdAt: new Date('2025-11-21T11:30:00Z') },
      });

      await GET({} as NextRequest);

      const callArgs = mocks.mockPrisma.asset.aggregate.mock.calls[0][0];
      expect(callArgs.where).toEqual({
        ownerUserId: 'multi-filter-user',
        deletedAt: null,
      });
    });
  });

  describe('Date Formatting', () => {
    it('should format lastUploadAt as ISO 8601 string', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('date-format-user');

      const testDate = new Date('2025-11-21T09:45:30.123Z');
      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('timezone-user');

      // Date with explicit UTC
      const utcDate = new Date('2025-11-21T00:00:00.000Z');
      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('query-error-user');

      mocks.mockPrisma.asset.aggregate.mockRejectedValue(new Error('Connection timeout'));

      // Suppress console.error (structured logging writes JSON to console.error)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch stats');

      // Verify error was logged via structured logging (JSON with context field)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"context":"stats:get-failed"')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle malformed aggregate responses', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('malformed-data-user');

      // Mock unexpected aggregate structure that will cause runtime error
      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('unexpected-error-user');

      // Simulate unexpected runtime error
      mocks.mockPrisma.asset.aggregate.mockImplementation(() => {
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
      mocks.mockRequireUserIdWithSync.mockResolvedValue('performance-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 1000 },
        _sum: { size: 1073741824 }, // 1 GB
        _max: { createdAt: new Date('2025-11-21T22:00:00Z') },
      });

      await GET({} as NextRequest);

      // Should only call aggregate once
      expect(mocks.mockPrisma.asset.aggregate).toHaveBeenCalledTimes(1);
    });

    it('should not perform any joins or additional queries', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('efficient-query-user');

      const aggregateSpy = vi.spyOn(mocks.mockPrisma.asset, 'aggregate');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 50 },
        _sum: { size: 5242880 },
        _max: { createdAt: new Date('2025-11-21T15:00:00Z') },
      });

      await GET({} as NextRequest);

      // Verify only aggregate was called (no findMany, findFirst, etc.)
      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      expect(mocks.mockPrisma.asset).not.toHaveProperty('findMany');
      expect(mocks.mockPrisma.asset).not.toHaveProperty('findFirst');

      aggregateSpy.mockRestore();
    });
  });

  describe('Response Structure', () => {
    it('should return all expected fields', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('structure-test-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 7 },
        _sum: { size: 7168 },
        _max: { createdAt: new Date('2025-11-21T13:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(Object.keys(data).sort()).toEqual([
        'assetCount',
        'billingCurrentPeriodEnd',
        'billingStatus',
        'lastUploadAt',
        'plan',
        'planName',
        'storageBytes',
        'storageLimitBytes',
        'storageRemainingBytes',
        'storageUsagePercent',
      ].sort());
    });

    it('should return JSON content type', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('content-type-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _sum: { size: 1024 },
        _max: { createdAt: new Date() },
      });

      const response = await GET({} as NextRequest);

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should have consistent field types', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('type-check-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
        _count: { id: 99 },
        _sum: { size: 999999 },
        _max: { createdAt: new Date('2025-11-21T17:00:00Z') },
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(typeof data.assetCount).toBe('number');
      expect(typeof data.storageBytes).toBe('number');
      expect(typeof data.storageLimitBytes).toBe('number');
      expect(typeof data.storageRemainingBytes).toBe('number');
      expect(typeof data.storageUsagePercent).toBe('number');
      expect(typeof data.lastUploadAt).toBe('string'); // ISO string, not null
    });

    it('should handle null lastUploadAt as null (not string)', async () => {
      mocks.mockRequireUserIdWithSync.mockResolvedValue('null-type-user');

      mocks.mockPrisma.asset.aggregate.mockResolvedValue({
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
