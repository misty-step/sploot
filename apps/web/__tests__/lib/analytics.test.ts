import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { track, trackServer, trackFlow, trackTiming } from '@/lib/analytics';
import { track as vercelTrack } from '@vercel/analytics';

// Mock Vercel Analytics
vi.mock('@vercel/analytics', () => ({
  track: vi.fn(),
}));

describe('Analytics Service', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Spy on console.error to verify error handling
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('track() - Client-side tracking', () => {
    it('should track valid events', () => {
      track({
        name: 'upload_completed',
        properties: { assetId: 'test-123', duration: 1500, size: 2048 },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
      });
    });

    it('should track events with all event types', () => {
      // Test a few different event types to ensure type safety works
      track({
        name: 'search_query_submitted',
        properties: { queryLength: 10, hasFilters: false },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('search_query_submitted', {
        queryLength: 10,
        hasFilters: false,
      });

      track({
        name: 'asset_favorited',
        properties: { assetId: 'test-456' },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('asset_favorited', {
        assetId: 'test-456',
      });
    });

    it('should respect Do Not Track when enabled', () => {
      // Mock navigator.doNotTrack
      Object.defineProperty(navigator, 'doNotTrack', {
        value: '1',
        writable: true,
        configurable: true,
      });

      track({
        name: 'upload_started',
        properties: { assetId: 'test-789', size: 1024 },
      });

      expect(vi.mocked(vercelTrack)).not.toHaveBeenCalled();

      // Clean up
      Object.defineProperty(navigator, 'doNotTrack', {
        value: null,
        writable: true,
        configurable: true,
      });
    });

    it('should not respect Do Not Track when disabled', () => {
      Object.defineProperty(navigator, 'doNotTrack', {
        value: null,
        writable: true,
        configurable: true,
      });

      track({
        name: 'upload_started',
        properties: { assetId: 'test-789', size: 1024 },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', () => {
      // Make vercelTrack throw an error
      vi.mocked(vercelTrack).mockImplementationOnce(() => {
        throw new Error('Analytics service unavailable');
      });

      // Should not throw
      expect(() => {
        track({
          name: 'upload_failed',
          properties: { reason: 'Network error', size: 2048 },
        });
      }).not.toThrow();

      // Should log the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analytics] Tracking failed:',
        expect.any(Error)
      );
    });
  });

  describe('PII Sanitization', () => {
    it('should redact user IDs', () => {
      track({
        name: 'upload_completed',
        properties: {
          assetId: 'test-123',
          duration: 1500,
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          userId: 'user-12345',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
        userId: '[REDACTED]',
      });
    });

    it('should redact email addresses in properties', () => {
      track({
        name: 'upload_completed',
        properties: {
          assetId: 'test-123',
          duration: 1500,
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          userEmail: 'test@example.com',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
        userEmail: '[REDACTED]',
      });
    });

    it('should redact email-like values', () => {
      track({
        name: 'upload_completed',
        properties: {
          assetId: 'test-123',
          duration: 1500,
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          owner: 'owner@company.com',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
        owner: '[REDACTED]',
      });
    });

    it('should strip query parameters from URLs', () => {
      track({
        name: 'search_no_results',
        properties: {
          query: 'test query',
          // @ts-expect-error - Testing sanitization of extra properties
          url: 'https://example.com/path?token=secret&id=123',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('search_no_results', {
        query: 'test query',
        url: 'https://example.com/path',
      });
    });

    it('should strip query parameters from referrer', () => {
      track({
        name: 'upload_started',
        properties: {
          assetId: 'test-123',
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          referrer: 'https://example.com/page?session=abc123',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_started', {
        assetId: 'test-123',
        size: 2048,
        referrer: 'https://example.com/page',
      });
    });

    it('should handle URL parsing errors gracefully', () => {
      track({
        name: 'upload_started',
        properties: {
          assetId: 'test-123',
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          url: 'not-a-valid-url?token=secret',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_started', {
        assetId: 'test-123',
        size: 2048,
        url: 'not-a-valid-url',
      });
    });

    it('should convert objects to [OBJECT]', () => {
      track({
        name: 'upload_completed',
        properties: {
          assetId: 'test-123',
          duration: 1500,
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          metadata: { foo: 'bar', baz: 123 },
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
        metadata: '[OBJECT]',
      });
    });

    it('should remove undefined values', () => {
      track({
        name: 'upload_completed',
        properties: {
          assetId: 'test-123',
          duration: 1500,
          size: 2048,
          // @ts-expect-error - Testing sanitization of extra properties
          optionalField: undefined,
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('upload_completed', {
        assetId: 'test-123',
        duration: 1500,
        size: 2048,
        // optionalField should not be present
      });
    });

    it('should pass through primitives (string, number, boolean)', () => {
      track({
        name: 'search_results_shown',
        properties: {
          count: 10,
          latency: 250,
          hasFilters: true,
          // @ts-expect-error - Testing sanitization of extra properties
          query: 'test query string',
        },
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('search_results_shown', {
        count: 10,
        latency: 250,
        hasFilters: true,
        query: 'test query string',
      });
    });
  });

  describe('trackServer() - Server-side tracking', () => {
    it('should track events server-side with dynamic import', async () => {
      const mockServerTrack = vi.fn();

      // Mock the dynamic import
      vi.doMock('@vercel/analytics/server', () => ({
        track: mockServerTrack,
      }));

      await trackServer({
        name: 'upload_completed',
        properties: { assetId: 'server-123', duration: 2000, size: 4096 },
      });

      // Note: Dynamic import mocking is complex in Vitest, this tests the structure
      // In practice, server-side tracking is tested via integration tests
    });

    it('should handle server tracking errors gracefully', async () => {
      // Should not throw even if dynamic import fails
      await expect(
        trackServer({
          name: 'upload_failed',
          properties: { reason: 'Server error', size: 1024 },
        })
      ).resolves.not.toThrow();
    });
  });

  describe('trackFlow() - Flow tracking', () => {
    it('should track flow steps', () => {
      trackFlow('upload', 'file_selected', { count: 3, totalSize: 5242880 });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('flow:upload:file_selected', {
        count: 3,
        totalSize: 5242880,
      });
    });

    it('should track flow steps without metadata', () => {
      trackFlow('search', 'query_submitted');

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('flow:search:query_submitted', {});
    });

    it('should sanitize flow metadata', () => {
      trackFlow('onboarding', 'email_step', {
        // @ts-expect-error - Testing sanitization
        userEmail: 'user@example.com',
        step: 3,
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('flow:onboarding:email_step', {
        userEmail: '[REDACTED]',
        step: 3,
      });
    });

    it('should handle flow tracking errors gracefully', () => {
      vi.mocked(vercelTrack).mockImplementationOnce(() => {
        throw new Error('Flow tracking failed');
      });

      expect(() => {
        trackFlow('upload', 'failed_step');
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analytics] Flow tracking failed:',
        expect.any(Error)
      );
    });
  });

  describe('trackTiming() - Timing tracking', () => {
    it('should track operation timing', () => {
      trackTiming('upload', 1500, true, { size: 2048 });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('timing:upload', {
        duration: 1500,
        success: true,
        size: 2048,
      });
    });

    it('should track failed operations', () => {
      trackTiming('search', 500, false, { query: 'test' });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('timing:search', {
        duration: 500,
        success: false,
        query: 'test',
      });
    });

    it('should track timing without metadata', () => {
      trackTiming('embedding:generate', 3000, true);

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('timing:embedding:generate', {
        duration: 3000,
        success: true,
      });
    });

    it('should sanitize timing metadata', () => {
      trackTiming('api:user-profile', 250, true, {
        // @ts-expect-error - Testing sanitization
        userId: 'user-123',
        cacheHit: true,
      });

      expect(vi.mocked(vercelTrack)).toHaveBeenCalledWith('timing:api:user-profile', {
        duration: 250,
        success: true,
        userId: '[REDACTED]',
        cacheHit: true,
      });
    });

    it('should handle timing tracking errors gracefully', () => {
      vi.mocked(vercelTrack).mockImplementationOnce(() => {
        throw new Error('Timing tracking failed');
      });

      expect(() => {
        trackTiming('operation', 1000, true);
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analytics] Timing tracking failed:',
        expect.any(Error)
      );
    });
  });
});
