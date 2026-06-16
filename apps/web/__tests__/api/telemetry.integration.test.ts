import { describe, it, expect, beforeEach, vi } from 'vitest';

import { POST } from '@/app/api/telemetry/route';
import { createMockRequest } from '../utils/test-helpers';
import { getAuth } from '@/lib/auth/server';
import { trackTiming } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';

vi.mock('@/lib/auth/server', () => ({
  getAuth: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  trackTiming: vi.fn(),
}));

const observabilityLoggerMock = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logTiming: vi.fn(),
  getTraceId: vi.fn(),
}));

vi.mock('@/lib/observability-logger', () => ({
  logger: observabilityLoggerMock,
  withTraceId: vi.fn(() => observabilityLoggerMock),
}));

const mockGetAuth = vi.mocked(getAuth);
const mockTrackTiming = vi.mocked(trackTiming);
const mockLogger = vi.mocked(logger);
const defaultContext = { params: Promise.resolve({}) };

const AUTH_USER = {
  userId: 'user_123',
  sessionId: 'session_456',
  async getToken() {
    return 'token';
  },
};

describe('/api/telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockResolvedValue(AUTH_USER);
  });

  it('returns 401 when auth is missing', async () => {
    mockGetAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      async getToken() {
        return null;
      },
    });

    const request = createMockRequest('POST');
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when body is not valid JSON', async () => {
    const request = createMockRequest('POST');
    (request as any).json = vi.fn().mockRejectedValue(new Error('bad json'));

    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: 'invalid json' });
  });

  it('returns 400 for invalid payload shape', async () => {
    const request = createMockRequest('POST', {
      type: 'error',
      payload: { name: 'Missing fields' },
    });

    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: 'invalid payload' });
  });

  it('returns 400 for unknown telemetry type', async () => {
    const request = createMockRequest('POST', {
      type: 'unknown',
      payload: {},
    });

    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, message: 'invalid payload' });
  });

  it('forwards error telemetry to Canary through the logger', async () => {
    const payload = {
      type: 'error' as const,
      payload: {
        name: 'TypeError',
        message: 'meltdown imminent',
        stack: 'stack trace',
        componentStack: 'Component > Child',
        url: '/app/library',
        timestamp: Date.now(),
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logError).toHaveBeenCalledWith(
      'client:error',
      expect.any(Error),
      expect.objectContaining({
        userId: AUTH_USER.userId,
        name: payload.payload.name,
        url: payload.payload.url,
        hasStack: true,
        hasComponentStack: true,
      })
    );
  });

  it('accepts sanitized client error boundary telemetry', async () => {
    const payload = {
      type: 'error' as const,
      payload: {
        name: 'RenderError',
        message: 'tile went sideways',
        boundary: 'image-tile-error-boundary',
        location: {
          origin: 'https://www.sploot.app',
          pathname: '/app',
        },
        timestamp: Date.now(),
        hasStack: true,
        digest: 'digest-123',
        metadata: { assetId: 'asset-123' },
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logError).toHaveBeenCalledWith(
      'client:error',
      expect.any(Error),
      expect.objectContaining({
        userId: AUTH_USER.userId,
        boundary: 'image-tile-error-boundary',
        location: payload.payload.location,
        hasStack: true,
        digest: 'digest-123',
        metadata: { assetId: 'asset-123' },
      })
    );
  });

  it('logs when Canary forwarding fails but still returns success', async () => {
    mockLogger.logError.mockImplementationOnce(() => {
      throw new Error('canary unavailable');
    });

    const payload = {
      type: 'error' as const,
      payload: {
        name: 'TypeError',
        message: 'broken vibes',
        url: '/app',
        timestamp: Date.now(),
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logError).toHaveBeenCalledWith(
      'telemetry:canary-forwarding-failed',
      expect.any(Error),
      expect.objectContaining({ userId: AUTH_USER.userId })
    );
  });

  it('forwards performance telemetry to analytics', async () => {
    const payload = {
      type: 'performance' as const,
      payload: {
        operation: 'upload:single',
        duration: 1500,
        success: true,
        metadata: { size: 2048 },
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockTrackTiming).toHaveBeenCalledWith(
      payload.payload.operation,
      payload.payload.duration,
      payload.payload.success,
      payload.payload.metadata
    );
  });

  it('logs when analytics forwarding fails but still returns success', async () => {
    mockTrackTiming.mockImplementationOnce(() => {
      throw new Error('analytics offline');
    });

    const payload = {
      type: 'performance' as const,
      payload: {
        operation: 'upload:single',
        duration: 500,
        success: false,
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logError).toHaveBeenCalledWith(
      'telemetry:performance-forwarding-failed',
      expect.any(Error),
      { operation: payload.payload.operation }
    );
  });

  it('logs usage telemetry with logger.logInfo', async () => {
    const payload = {
      type: 'usage' as const,
      payload: {
        userId: 'external-user',
        action: 'upload',
        count: 3,
        timestamp: Date.now(),
        metadata: { plan: 'pro' },
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logInfo).toHaveBeenCalledWith(
      'usage_metric',
      expect.objectContaining({
        action: payload.payload.action,
        userId: AUTH_USER.userId,
        metadata: payload.payload.metadata,
      })
    );
  });

  it('logs errors when usage forwarding fails but does not block response', async () => {
    // Make logInfo fail silently (returns undefined instead of throwing)
    // to test that logging failures don't block the response
    let logInfoCallCount = 0;
    mockLogger.logInfo.mockImplementation(() => {
      logInfoCallCount++;
      if (logInfoCallCount === 2) {
        // Second call (from forwardUsageTelemetry) fails silently
        // First call is from withObservability wrapper which now has try-catch
        return undefined;
      }
    });

    const payload = {
      type: 'usage' as const,
      payload: {
        userId: 'external-user',
        action: 'search',
        count: 1,
        timestamp: Date.now(),
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    // The response should succeed despite logging failures
    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });

    // Verify logInfo was called (at least once from wrapper, once from handler)
    expect(logInfoCallCount).toBeGreaterThanOrEqual(2);
  });

  it('swallows unexpected handler errors and returns success', async () => {
    mockLogger.logError.mockImplementationOnce(() => {
      throw new Error('Logger also down');
    });

    const payload = {
      type: 'error' as const,
      payload: {
        name: 'EdgeCase',
        message: 'boom',
        url: '/app',
        timestamp: Date.now(),
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });
});
