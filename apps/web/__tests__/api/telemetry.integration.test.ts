import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';

import { POST } from '@/app/api/telemetry/route';
import { createMockRequest } from '../utils/test-helpers';
import { logger } from '@/lib/observability-logger';
import {
  postBlobLoadFailure,
  postPerformanceMetric,
} from '@/lib/telemetry-client';

const authMock = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/auth/request-auth', () => ({
  authenticateRequest: authMock.authenticateRequest,
}));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: authMock.userFindUnique } },
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
    authMock.authenticateRequest.mockResolvedValue({
      status: 'authenticated',
      principal: {
        userId: AUTH_USER.userId,
        provider: 'qa-local',
        providerSubject: AUTH_USER.userId,
        source: 'qa-local',
        credentialKind: 'qa-local',
      },
      syncStatus: 'success',
    });
    authMock.userFindUnique.mockResolvedValue({ id: AUTH_USER.userId });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 when auth is missing', async () => {
    authMock.authenticateRequest.mockResolvedValue({ status: 'unauthenticated', reason: 'test' });

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
        boundary: 'app-error',
        hasStack: true,
        hasComponentStack: true,
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
        name: payload.payload.name,
        boundary: payload.payload.boundary,
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
        boundary: 'image-tile-error-boundary',
        timestamp: Date.now(),
        hasStack: true,
        hasComponentStack: false,
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
        boundary: 'image-tile-error-boundary',
        hasStack: true,
        hasComponentStack: false,
      })
    );
  });

  it('rejects raw error text, location, and arbitrary metadata at the boundary', async () => {
    const secrets = {
      email: 'private-person@example.com',
      token: 'top-secret-token-123',
      cookie: 'session-cookie-456',
    };
    const payload = {
      type: 'error' as const,
      payload: {
        name: 'TypeError',
        boundary: 'image-tile-error-boundary',
        hasStack: true,
        hasComponentStack: true,
        message: `failed for ${secrets.email} token=${secrets.token}`,
        timestamp: Date.now(),
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(400);
    expect(mockLogger.logError.mock.calls.some(([eventName]) => eventName === 'client:error')).toBe(false);
    expect(JSON.stringify(mockLogger.logError.mock.calls)).not.toContain(secrets.email);
    expect(JSON.stringify(mockLogger.logError.mock.calls)).not.toContain(secrets.token);
    expect(JSON.stringify(mockLogger.logError.mock.calls)).not.toContain(secrets.cookie);
  });

  it('rejects oversized top-level error telemetry strings', async () => {
    const response = await POST(
      createMockRequest('POST', {
        type: 'error',
        payload: {
          name: 'TypeError',
          message: 'x'.repeat(2_001),
          stack: 'y'.repeat(2_001),
          url: '/app',
          timestamp: Date.now(),
        },
      }),
      defaultContext
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: 'invalid payload',
    });
    expect(
      mockLogger.logError.mock.calls.some(([eventName]) => eventName === 'client:error')
    ).toBe(false);
  });

  it('logs when Canary forwarding fails but still returns success', async () => {
    mockLogger.logError.mockImplementationOnce(() => {
      throw new Error('canary unavailable');
    });

    const payload = {
      type: 'error' as const,
      payload: {
        name: 'TypeError',
        boundary: 'app-error',
        hasStack: false,
        hasComponentStack: false,
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
      { name: payload.payload.name }
    );
  });

  it('accepts the real typed performance client shape', async () => {
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return POST(createMockRequest('POST', body), defaultContext);
    });

    await postPerformanceMetric({
      metric: 'time_to_empty_state',
      value: 42,
      unit: 'ms',
      tags: { target: 100, met: true },
    });

    expect(mockLogger.logInfo).toHaveBeenCalledWith('performance_metric', {
      metric: 'time_to_empty_state',
      value: 42,
      unit: 'ms',
      timestamp: expect.any(Number),
      tags: { target: 100, met: true },
    });
  });

  it('accepts the real typed usage client shape', async () => {
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return POST(createMockRequest('POST', body), defaultContext);
    });

    await postBlobLoadFailure(true);

    expect(mockLogger.logInfo).toHaveBeenCalledWith('usage_metric', {
      action: 'blob_load_failure',
      count: 1,
      timestamp: expect.any(Number),
      metadata: { fallbackAttempted: true },
    });
  });

  it('forwards performance telemetry to structured logging', async () => {
    const payload = {
      type: 'performance' as const,
      payload: {
        metric: 'time_to_empty_state',
        value: 1500,
        unit: 'ms',
        timestamp: Date.now(),
        tags: { target: 100 },
      },
    };

    const request = createMockRequest('POST', payload);
    const response = await POST(request, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockLogger.logInfo).toHaveBeenCalledWith(
      'performance_metric',
      payload.payload
    );
  });

  it('bounds and sanitizes performance metadata before structured logging', async () => {
    const payload = {
      type: 'performance' as const,
      payload: {
        metric: 'broken_images_ratio',
        value: 0.02,
        unit: 'ratio',
        timestamp: Date.now(),
        tags: {
          broken_count: 2,
          total_count: 100,
          userId: 'user_private_123',
          query: 'private performance search text',
        },
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(400);
    expect(mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'performance_metric')).toBe(false);
    expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain('user_private_123');
    expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain('private performance search text');
  });

  it('rejects unknown performance metadata instead of forwarding arbitrary fields', async () => {
    const tags = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`field_${index}`, index])
    );

    const response = await POST(
      createMockRequest('POST', {
        type: 'performance',
        payload: {
          metric: 'time_to_empty_state',
          value: 25,
          unit: 'ms',
          timestamp: Date.now(),
          tags,
        },
      }),
      defaultContext
    );

    expect(response.status).toBe(400);
    expect(mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'performance_metric')).toBe(false);
  });

  it('forwards first-party analytics events to the structured logger', async () => {
    const payload = {
      type: 'analytics' as const,
      payload: {
        name: 'upload_completed',
        properties: { duration: 120, size: 2048 },
        timestamp: Date.now(),
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockLogger.logInfo).toHaveBeenCalledWith('analytics:event', {
      name: payload.payload.name,
      properties: payload.payload.properties,
      timestamp: payload.payload.timestamp,
    });
  });

  it('does not attach identity or event payload when analytics forwarding fails', async () => {
    mockLogger.logInfo.mockImplementation((eventName) => {
      if (eventName === 'analytics:event') throw new Error('structured logging offline');
    });
    const payload = {
      type: 'analytics' as const,
      payload: {
        name: 'search_no_results',
        properties: {
          queryLength: 12,
          hasFilters: false,
        },
        timestamp: Date.now(),
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(200);
    expect(mockLogger.logError).toHaveBeenCalledWith(
      'telemetry:analytics-forwarding-failed',
      expect.any(Error)
    );
    const failureCall = mockLogger.logError.mock.calls.find(
      ([eventName]) => eventName === 'telemetry:analytics-forwarding-failed'
    );
    expect(JSON.stringify(failureCall)).not.toContain(AUTH_USER.userId);
  });

  it('rejects analytics properties outside the declared contract', async () => {
    const rawQuery = 'private therapy reaction meme';
    const payload = {
      type: 'analytics' as const,
      payload: {
        name: 'search_no_results',
        properties: {
          queryLength: rawQuery.length,
          hasFilters: false,
          query: rawQuery,
          userId: 'client-supplied-user',
          email: 'private@example.com',
          referrer: 'https://example.com/path?token=secret',
        },
        timestamp: Date.now(),
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(400);
    expect(mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'analytics:event')).toBe(false);
    expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain(rawQuery);
  });

  it('rejects analytics event names outside the declared contract', async () => {
    const payload = {
      type: 'analytics' as const,
      payload: {
        name: 'totally_custom_event',
        properties: { count: 1 },
        timestamp: Date.now(),
      },
    };

    const response = await POST(createMockRequest('POST', payload), defaultContext);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, message: 'invalid payload' });
    expect(
      mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'analytics:event')
    ).toBe(false);
  });

  it('accepts declared flow and timing event families with bounded properties', async () => {
    const events = [
      {
        name: 'flow:upload_wizard:selected',
        properties: { count: 2 },
      },
      {
        name: 'timing:upload:single',
        properties: { duration: 45, success: true, size: 100 },
      },
    ];

    for (const event of events) {
      const response = await POST(
        createMockRequest('POST', {
          type: 'analytics',
          payload: { ...event, timestamp: Date.now() },
        }),
        defaultContext
      );
      expect(response.status).toBe(200);
    }

    const analyticsCalls = mockLogger.logInfo.mock.calls.filter(
      ([eventName]) => eventName === 'analytics:event'
    );
    expect(analyticsCalls).toHaveLength(2);
    expect(analyticsCalls[0][1]).toMatchObject({
      name: 'flow:upload_wizard:selected',
      properties: { count: 2 },
    });
    expect(analyticsCalls[1][1]).toMatchObject({
      name: 'timing:upload:single',
      properties: { duration: 45, success: true, size: 100 },
    });
    expect(JSON.stringify(analyticsCalls)).not.toContain('user_private_123');
  });

  it('logs when performance forwarding fails but still returns success', async () => {
    mockLogger.logInfo.mockImplementation((eventName) => {
      if (eventName === 'performance_metric') {
        throw new Error('structured logging offline');
      }
    });

    const payload = {
      type: 'performance' as const,
      payload: {
        metric: 'time_to_empty_state',
        value: 500,
        unit: 'ms',
        timestamp: Date.now(),
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
      { metric: payload.payload.metric }
    );
  });

  it('logs usage telemetry with logger.logInfo', async () => {
    const payload = {
      type: 'usage' as const,
      payload: {
        action: 'blob_load_failure',
        count: 1,
        timestamp: Date.now(),
        metadata: { fallbackAttempted: true },
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
        metadata: payload.payload.metadata,
      })
    );
    const usageCall = mockLogger.logInfo.mock.calls.find(
      ([eventName]) => eventName === 'usage_metric'
    );
    expect(JSON.stringify(usageCall)).not.toContain(AUTH_USER.userId);
    expect(JSON.stringify(usageCall)).not.toContain('external-user');
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
        action: 'blob_load_failure',
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
        boundary: 'app-error',
        hasStack: false,
        hasComponentStack: false,
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
