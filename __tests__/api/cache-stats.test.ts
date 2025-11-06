import { GET, POST } from '@/app/api/cache/stats/route';
import { createMockRequest } from '../utils/test-helpers';
import { getAuth } from '@/lib/auth/server';
import { getCacheService } from '@/lib/cache';
import type { CacheStats } from '@/lib/cache';

// Mock dependencies
vi.mock('@/lib/auth/server');
vi.mock('@/lib/cache');

const mockGetAuth = vi.mocked(getAuth);
const mockGetCacheService = vi.mocked(getCacheService);
const defaultContext = { params: Promise.resolve({}) };

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
  });

  describe('GET', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockGetAuth.mockResolvedValue({ userId: null, sessionId: null, async getToken() { return null; } });

      const request = createMockRequest('GET');
      const response = await GET(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should return cache statistics', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache({
        hits: 150,
        misses: 30,
        totalRequests: 180,
        hitRate: 0.8333,
        lastReset: new Date('2024-01-01'),
      });
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('GET');
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
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache({
        hits: 70,
        misses: 80,
        totalRequests: 150,
        hitRate: 0.4667,
        lastReset: new Date(),
      });
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('GET');
      const response = await GET(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.performance.meetsTarget).toBe(false);
      expect(data.performance.currentHitRate).toBe('46.67%');
    });
  });

  describe('POST', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockGetAuth.mockResolvedValue({ userId: null, sessionId: null, async getToken() { return null; } });

      const request = createMockRequest('POST', null, {}, {
        action: 'reset-stats',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reset cache statistics', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('POST', null, {}, {
        action: 'reset-stats',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache statistics reset successfully');
      expect(mockCache.resetStats).toHaveBeenCalled();
    });

    it('should clear cache for clear-all action', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('POST', null, {}, {
        action: 'clear-all',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache cleared successfully');
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should clear cache for invalidate action', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('POST', null, {}, {
        action: 'invalidate',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Cache cleared successfully');
      expect(mockCache.clear).toHaveBeenCalled();
    });

    it('should return 501 for cache warming (not implemented)', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('POST', null, {}, {
        action: 'warm',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(501);
      expect(data.message).toBe('Cache warming not available in memory-only mode');
    });

    it('should return 400 for invalid action', async () => {
      mockGetAuth.mockResolvedValue({ userId: 'test-user-id', sessionId: 'test-session', async getToken() { return null; } });

      const mockCache = createMockCache();
      mockGetCacheService.mockReturnValue(mockCache as any);

      const request = createMockRequest('POST', null, {}, {
        action: 'invalid-action',
      });

      const response = await POST(request, defaultContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid action');
    });
  });
});
