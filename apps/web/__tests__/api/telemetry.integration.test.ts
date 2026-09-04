import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';

import { POST } from '@/app/api/telemetry/route';
import { __resetTelemetryRateLimitForTests } from '@/lib/telemetry-rate-limit';
import { createMockRequest as buildMockRequest } from '../utils/test-helpers';

// The route enforces its byte cap on the web stream itself; the shared mock's
// NextRequest does not expose a web-standard body in this environment, so
// give each request a real ReadableStream carrying the exact JSON bytes.
const createMockRequest = (
  method: string,
  body?: unknown,
  headers?: Record<string, string>
) => {
  const request = buildMockRequest(method, body, headers);
  if (body !== undefined) {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    Object.defineProperty(request, 'body', {
      value: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
  }
  return request;
};
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
    __resetTelemetryRateLimitForTests();
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

  it('forwards bounded error telemetry to structured logs', async () => {
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
    expect(mockLogger.logInfo).toHaveBeenCalledWith(
      'client:error',
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
    expect(mockLogger.logInfo).toHaveBeenCalledWith(
      'client:error',
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
      mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'client:error')
    ).toBe(false);
  });

  it('logs when structured error forwarding fails but still returns success', async () => {
    mockLogger.logInfo.mockImplementation(() => {
      throw new Error('structured logger unavailable');
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
      'telemetry:structured-log-failed',
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

  it('rejects performance tags with values outside their declared contract', async () => {
    const invalidTags = [
      { target: '100' },
      { met: 'true' },
      { broken_count: -1 },
      { percent: 'not-a-percent' },
      { rating: 'excellent' },
    ];

    for (const tags of invalidTags) {
      const response = await POST(
        createMockRequest('POST', {
          type: 'performance',
          payload: {
            metric: 'broken_images_ratio',
            value: 0.02,
            unit: 'ratio',
            timestamp: Date.now(),
            tags,
          },
        }),
        defaultContext
      );

      expect(response.status, JSON.stringify(tags)).toBe(400);
    }
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

  it('rejects attacker-controlled flow and timing event names without logging them', async () => {
    for (const name of ['flow:secretToken123:step', 'timing:private:query:token']) {
      const response = await POST(
        createMockRequest('POST', {
          type: 'analytics',
          payload: { name, properties: {}, timestamp: Date.now() },
        }),
        defaultContext,
      );
      expect(response.status).toBe(400);
    }

    expect(mockLogger.logInfo.mock.calls.some(([eventName]) => eventName === 'analytics:event')).toBe(false);
    expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain('secretToken123');
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

  it('rejects usage metadata outside fallbackAttempted', async () => {
    const response = await POST(
      createMockRequest('POST', {
        type: 'usage',
        payload: {
          action: 'blob_load_failure',
          count: 1,
          timestamp: Date.now(),
          metadata: { fallbackAttempted: true, assetId: 'private-asset' },
        },
      }),
      defaultContext
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain('private-asset');
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

  describe('adversarial payload bounds', () => {
    const URL_WITH_TOKEN = 'https://evil.example/cb?token=leaked-bearer-credential-123456';

    it('rejects a URL string smuggled into a numeric analytics property', async () => {
      const request = createMockRequest('POST', {
        type: 'analytics',
        payload: {
          name: 'search_result_clicked',
          properties: { position: URL_WITH_TOKEN, score: 0.9 },
          timestamp: Date.now(),
        },
      });

      const response = await POST(request, defaultContext);

      expect(response.status).toBe(400);
      expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain(URL_WITH_TOKEN);
    });

    it('rejects an upload_failed reason outside the bounded enum', async () => {
      const request = createMockRequest('POST', {
        type: 'analytics',
        payload: {
          name: 'upload_failed',
          properties: { reason: URL_WITH_TOKEN, size: 100 },
          timestamp: Date.now(),
        },
      });

      const response = await POST(request, defaultContext);

      expect(response.status).toBe(400);
      expect(JSON.stringify(mockLogger.logInfo.mock.calls)).not.toContain(URL_WITH_TOKEN);
    });

    it('rejects a boolean-typed timing property delivered as a string', async () => {
      const request = createMockRequest('POST', {
        type: 'analytics',
        payload: {
          name: 'timing:search',
          properties: { duration: 12, success: 'true' },
          timestamp: Date.now(),
        },
      });

      const response = await POST(request, defaultContext);

      expect(response.status).toBe(400);
    });

    it('rejects a non-finite numeric analytics property', async () => {
      const request = createMockRequest('POST', {
        type: 'analytics',
        payload: {
          name: 'search_result_clicked',
          properties: { position: Number.NaN, score: 0.9 },
          timestamp: Date.now(),
        },
      });

      const response = await POST(request, defaultContext);

      expect(response.status).toBe(400);
    });

    it('returns 413 for a body over the telemetry byte cap', async () => {
      const request = createMockRequest('POST', {
        type: 'analytics',
        payload: {
          name: 'x'.repeat(20_000),
          properties: {},
          timestamp: Date.now(),
        },
      });

      const response = await POST(request, defaultContext);
      const body = await response.json();

      expect(response.status).toBe(413);
      expect(body).toEqual({ success: false, message: 'payload too large' });
      expect(mockLogger.logInfo.mock.calls.some(([name]) => name === 'analytics:event')).toBe(false);
    });

    it('returns 413 for an oversized declared content-length without reading the body', async () => {
      const request = createMockRequest('POST', undefined, {
        'content-length': String(1_000_000),
      });

      const response = await POST(request, defaultContext);

      expect(response.status).toBe(413);
    });

    it('rate limits a user after 60 requests in one window and isolates other users', async () => {
      const payload = () => ({
        type: 'usage' as const,
        payload: { action: 'blob_load_failure', count: 1, timestamp: Date.now() },
      });

      for (let i = 0; i < 60; i += 1) {
        const okResponse = await POST(createMockRequest('POST', payload()), defaultContext);
        expect(okResponse.status).toBe(200);
      }

      const limited = await POST(createMockRequest('POST', payload()), defaultContext);
      const limitedBody = await limited.json();
      expect(limited.status).toBe(429);
      expect(limitedBody).toEqual({ success: false, message: 'rate limited' });

      authMock.authenticateRequest.mockResolvedValue({
        status: 'authenticated',
        principal: {
          userId: 'user_other',
          provider: 'qa-local',
          providerSubject: 'user_other',
          source: 'qa-local',
          credentialKind: 'qa-local',
        },
        syncStatus: 'success',
      });
      authMock.userFindUnique.mockResolvedValue({ id: 'user_other' });

      const otherUser = await POST(createMockRequest('POST', payload()), defaultContext);
      expect(otherUser.status).toBe(200);
    });
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
