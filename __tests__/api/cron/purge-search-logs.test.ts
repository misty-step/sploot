import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/purge-search-logs/route';
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Mock lib/db
const mockPrisma = {
  searchLog: {
    deleteMany: vi.fn(),
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

// Mock observability - use importOriginal to keep withTraceId and other exports
vi.mock('@/lib/observability-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability-logger')>();
  return {
    ...actual,
    logger: {
      logInfo: vi.fn(),
      logError: vi.fn(),
      logTiming: vi.fn(),
    },
  };
});

describe('/api/cron/purge-search-logs', () => {
  const CRON_SECRET = 'test-cron-secret-key-12345';
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

    // Default: deleteMany succeeds with zero count
    mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 0 });
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

    it('should return 401 with invalid CRON_SECRET', async () => {
      mockHeaders.mockReturnValue({
        get: vi.fn((key: string) => {
          if (key === 'authorization') return 'Bearer wrong-secret-key';
          return null;
        }),
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should use timing-safe comparison for auth token validation', async () => {
      // Test that timingSafeEqual is the mechanism (indirectly by testing behavior)
      // Both valid and invalid tokens should take similar time due to constant-time comparison

      const validToken = `Bearer ${CRON_SECRET}`;
      const invalidToken = 'Bearer ' + 'x'.repeat(CRON_SECRET.length); // Same length

      // Timing-safe requires equal length comparison
      mockHeaders.mockReturnValue({
        get: vi.fn(() => validToken),
      });

      const response1 = await GET({} as NextRequest);
      expect(response1.status).toBe(200);

      // Now test with invalid but same-length token
      mockHeaders.mockReturnValue({
        get: vi.fn(() => invalidToken),
      });

      const response2 = await GET({} as NextRequest);
      expect(response2.status).toBe(401);

      // Test with different length (should fail length check before timingSafeEqual)
      mockHeaders.mockReturnValue({
        get: vi.fn(() => 'Bearer short'),
      });

      const response3 = await GET({} as NextRequest);
      expect(response3.status).toBe(401);
    });

    it('should return 503 when database is unavailable', async () => {
      mockDatabaseAvailable = false;

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Database not configured');
    });
  });

  describe('Search Log Purging', () => {
    it('should delete search logs older than 30 days and return deleted count', async () => {
      const mockDeleteResult = { count: 42 };
      mockPrisma.searchLog.deleteMany.mockResolvedValue(mockDeleteResult);

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deleted).toBe(42);
      expect(data).toHaveProperty('cutoff');
      expect(data).toHaveProperty('durationMs');
      expect(typeof data.durationMs).toBe('number');

      // Verify 30-day cutoff is correctly calculated
      const deleteCall = mockPrisma.searchLog.deleteMany.mock.calls[0][0];
      const cutoffDate = deleteCall.where.createdAt.lt;
      expect(cutoffDate).toBeInstanceOf(Date);

      const daysDiff = Math.floor((Date.now() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(29); // Allow for test execution time
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should return success when no logs need purging', async () => {
      mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 0 });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.deleted).toBe(0);
      expect(data).toHaveProperty('cutoff');
      expect(data).toHaveProperty('durationMs');

      // Verify deleteMany was called with correct filter
      expect(mockPrisma.searchLog.deleteMany).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.searchLog.deleteMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.lt).toBeInstanceOf(Date);
    });

    it('should calculate cutoff date as exactly 30 days ago', async () => {
      mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 5 });

      const beforeCall = Date.now();
      await GET({} as NextRequest);
      const afterCall = Date.now();

      const callArgs = mockPrisma.searchLog.deleteMany.mock.calls[0][0];
      const cutoffTime = callArgs.where.createdAt.lt.getTime();

      // Cutoff should be approximately 30 days before the call time
      const expectedMin = beforeCall - THIRTY_DAYS_MS - 1000; // 1s tolerance
      const expectedMax = afterCall - THIRTY_DAYS_MS + 1000;

      expect(cutoffTime).toBeGreaterThanOrEqual(expectedMin);
      expect(cutoffTime).toBeLessThanOrEqual(expectedMax);
    });

    it('should include cutoff timestamp in ISO format in response', async () => {
      mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 10 });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.cutoff).toBeDefined();
      expect(typeof data.cutoff).toBe('string');

      // Verify it's valid ISO 8601 format
      const cutoffDate = new Date(data.cutoff);
      expect(cutoffDate.toISOString()).toBe(data.cutoff);

      // Verify it's approximately 30 days ago
      const daysDiff = Math.floor((Date.now() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it('should measure and return operation duration', async () => {
      // Simulate slow database operation
      mockPrisma.searchLog.deleteMany.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { count: 3 };
      });

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(data.durationMs).toBeDefined();
      expect(typeof data.durationMs).toBe('number');
      expect(data.durationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully with 500 response', async () => {
      mockPrisma.searchLog.deleteMany.mockRejectedValue(new Error('Database connection timeout'));

      // Suppress console error from logger
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to purge search logs');

      // Should not expose internal error details in response
      expect(data).not.toHaveProperty('details');
      expect(data).not.toHaveProperty('message');

      consoleErrorSpy.mockRestore();
    });

    it('should handle Prisma errors gracefully', async () => {
      const prismaError = new Error('P2024: Timed out fetching a new connection');
      mockPrisma.searchLog.deleteMany.mockRejectedValue(prismaError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET({} as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to purge search logs');

      consoleErrorSpy.mockRestore();
    });

    it('should log errors with duration context', async () => {
      const { logger } = await import('@/lib/observability-logger');
      mockPrisma.searchLog.deleteMany.mockRejectedValue(new Error('Test error'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await GET({} as NextRequest);

      expect(logger.logError).toHaveBeenCalledWith(
        'cron.purge-search-logs.error',
        expect.any(Error),
        expect.objectContaining({
          durationMs: expect.any(Number),
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Observability', () => {
    it('should log successful purge operations with metrics', async () => {
      const { logger } = await import('@/lib/observability-logger');
      mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 15 });

      await GET({} as NextRequest);

      expect(logger.logInfo).toHaveBeenCalledWith(
        'cron.purge-search-logs.complete',
        expect.objectContaining({
          deleted: 15,
          cutoff: expect.any(String),
          durationMs: expect.any(Number),
        })
      );
    });

    it('should include ISO timestamp in log output', async () => {
      const { logger } = await import('@/lib/observability-logger');
      mockPrisma.searchLog.deleteMany.mockResolvedValue({ count: 5 });

      await GET({} as NextRequest);

      const logCall = vi.mocked(logger.logInfo).mock.calls[0];
      const logData = logCall[1];

      expect(logData.cutoff).toBeDefined();
      expect(typeof logData.cutoff).toBe('string');

      // Verify valid ISO format
      const cutoffDate = new Date(logData.cutoff);
      expect(cutoffDate.toISOString()).toBe(logData.cutoff);
    });
  });
});
