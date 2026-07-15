import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/cache/stats/route';
import { createMockRequest } from '../utils/test-helpers';
import { getCacheService } from '@/lib/cache';
import type { CacheStats } from '@/lib/cache';
import { createQaLocalAuthToken, createQaLocalProxyProof, getQaLocalAuthHeader, getQaLocalProxyProofHeader } from '@/lib/auth/qa-local';

// Mock dependencies
vi.mock('@/lib/cache');
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ id: 'test-user-id' }) } },
}));

const mockGetCacheService = vi.mocked(getCacheService);
const defaultContext = { params: Promise.resolve({}) };
const QA_SECRET = 'test-secret-with-enough-entropy';

// Helper to create mock cache service
function createMockCache(stats?: Partial<CacheStats>) {
  const defaultStats: CacheStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    hitRate: 0,
    lastReset: new Date(),
    ...stats,
  };

  return {
    getStats: vi.fn().mockReturnValue(defaultStats),
    resetStats: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('/api/cache/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPLOOT_QA_AUTH_MODE', 'enabled');
    vi.stubEnv('SPLOOT_QA_EVIDENCE_MODE', 'enabled');
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_ID', 'sploot-gallery-qa-local');
    vi.stubEnv('SPLOOT_QA_DEPLOYMENT_AUDIENCE', 'sploot-gallery-evidence');
    vi.stubEnv('DEPLOYMENT_ENV', 'qa-local');
    vi.stubEnv('SPLOOT_QA_AUTH_SECRET', QA_SECRET);
    vi.stubEnv('SPLOOT_DEPLOYMENT_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
  });

  async function createAuthenticatedRequest(
    method: string,
    searchParams?: Record<string, string>
  ) {
    const token = await createQaLocalAuthToken({
      userId: 'qa-test-user-id',
      secret: QA_SECRET,
      expiresInSeconds: 60,
    });
    const proxyProof = await createQaLocalProxyProof('localhost', '127.0.0.1', QA_SECRET);

    return createMockRequest(method, null, {
      [getQaLocalAuthHeader()]: token,
      [getQaLocalProxyProofHeader()]: proxyProof,
    }, searchParams);
  }

  describe('GET', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = createMockRequest('GET');
      const response = await GET(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return cache statistics', async () => {
      const mockCache = createMockCache({
        hits: 150,
        misses: 30,
        totalRequests: 180,
        hitRate: 0.8333,
        lastReset: new Date('2024-01-01'),
      });
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('GET');
      const response = await GET(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.cache.status).toBe('active');
      expect(data.cache.hits).toBe(150);
      expect(data.cache.misses).toBe(30);
      expect(data.overall.totalRequests).toBe(180);
      expect(data.overall.hitRate).toBe('83.33%');
      expect(data.performance.meetsTarget).toBe(true);
      expect(data.performance.targetHitRate).toBe('80%');
    });

    it('should indicate when cache performance is below target', async () => {
      const mockCache = createMockCache({
        hits: 70,
        misses: 80,
        totalRequests: 150,
        hitRate: 0.4667,
        lastReset: new Date(),
      });
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('GET');
      const response = await GET(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.performance.meetsTarget).toBe(false);
      expect(data.performance.currentHitRate).toBe('46.67%');
    });
  });

  describe('POST', () => {
    it('should return 401 if user is not authenticated', async () => {
      const request = createMockRequest('POST', null, {}, {
        action: 'reset-stats',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reset cache statistics', async () => {
      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('POST', {
        action: 'reset-stats',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache statistics reset successfully');
      expect(mockCache.resetStats).toHaveBeenCalled();
    });

    it('should clear cache for clear-all action', async () => {
      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('POST', {
        action: 'clear-all',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache cleared successfully');
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should clear cache for invalidate action', async () => {
      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('POST', {
        action: 'invalidate',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache cleared successfully');
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should return 501 for cache warming (not implemented)', async () => {
      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('POST', {
        action: 'warm',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(501);
      expect(data.message).toBe('Cache warming not available in memory-only mode');
    });

    it('should return 400 for invalid action', async () => {
      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = await createAuthenticatedRequest('POST', {
        action: 'invalid-action',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });
  });
});
