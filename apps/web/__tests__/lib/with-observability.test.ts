import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

interface LoggerRecord {
  traceId: string;
  logger: {
    logInfo: ReturnType<typeof vi.fn>;
    logTiming: ReturnType<typeof vi.fn>;
    logError: ReturnType<typeof vi.fn>;
  };
}

const loggerRecords: LoggerRecord[] = [];

const {
  withTraceIdMock,
  measureAsyncMock,
  getPerformanceMonitorMock,
  unstableRethrowMock,
  nanoidMock,
} = vi.hoisted(() => {
  const measureAsync = vi.fn<
    [string, () => Promise<NextResponse<unknown>>],
    Promise<NextResponse<unknown>>
  >();

  return {
    withTraceIdMock: vi.fn(),
    measureAsyncMock: measureAsync,
    getPerformanceMonitorMock: vi.fn(),
    unstableRethrowMock: vi.fn(),
    nanoidMock: vi.fn(),
  };
});

vi.mock('@/lib/observability-logger', () => ({
  withTraceId: withTraceIdMock,
}));

vi.mock('@/lib/performance-monitor', () => ({
  getPerformanceMonitor: getPerformanceMonitorMock,
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: unstableRethrowMock,
}));

vi.mock('nanoid', () => ({
  nanoid: nanoidMock,
}));

import { withObservability } from '@/lib/with-observability';

const BASE_TIME = Date.parse('2024-04-20T16:20:00.000Z');

beforeEach(() => {
  loggerRecords.length = 0;
  vi.clearAllMocks();

  withTraceIdMock.mockImplementation((traceId: string) => {
    const logger = {
      logInfo: vi.fn(),
      logTiming: vi.fn(),
      logError: vi.fn(),
    };
    loggerRecords.push({ traceId, logger });
    return logger;
  });

  measureAsyncMock.mockImplementation(async (_operation, run) => run());
  getPerformanceMonitorMock.mockImplementation(() => ({
    measureAsync: measureAsyncMock,
  }));
  unstableRethrowMock.mockImplementation(() => {});
  nanoidMock.mockReturnValue('trace-test');

  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE_TIME));
});

afterEach(() => {
  vi.useRealTimers();
});

function createRequest(url: string, method = 'GET'): NextRequest {
  const nextUrl = new URL(url);
  return {
    method,
    nextUrl,
    url: nextUrl.toString(),
  } as unknown as NextRequest;
}

function createResponse(status: number): NextResponse {
  return { status } as unknown as NextResponse;
}

const defaultContext = { params: Promise.resolve({}) };

describe('withObservability', () => {
  it('wraps handler and logs request lifecycle on success', async () => {
    const response = createResponse(201);
    const handler = vi.fn(async (req: NextRequest, context: any) => {
      vi.setSystemTime(new Date(BASE_TIME + 1_000));
      return response;
    });

    const req = createRequest('https://sploot.dev/api/gremlin?foo=bar', 'POST');
    const wrapped = withObservability(handler);
    const result = await wrapped(req, defaultContext);

    expect(result).toBe(response);
    expect(handler).toHaveBeenCalledWith(req, defaultContext);
    expect(nanoidMock).toHaveBeenCalledTimes(1);
    expect(getPerformanceMonitorMock).toHaveBeenCalledTimes(1);
    expect(measureAsyncMock).toHaveBeenCalledWith('/api/gremlin', expect.any(Function));

    const record = loggerRecords[0];
    expect(record?.traceId).toBe('trace-test');
    expect(record?.logger.logInfo).toHaveBeenCalledWith(
      'request:start',
      expect.objectContaining({
        method: 'POST',
        pathname: '/api/gremlin',
        traceId: 'trace-test',
        query: { foo: 'bar' },
        operation: '/api/gremlin',
      })
    );
    expect(record?.logger.logTiming).toHaveBeenCalledWith(
      '/api/gremlin',
      1000,
      true,
      expect.objectContaining({
        method: 'POST',
        pathname: '/api/gremlin',
        traceId: 'trace-test',
        statusCode: 201,
        duration: 1000,
        success: true,
      })
    );
    expect(record?.logger.logError).not.toHaveBeenCalled();
  });

  it('reports an explicit route contract error when a handler returns no response', async () => {
    const handler = vi.fn(async () => undefined as never);
    const wrapped = withObservability(handler);

    await expect(
      wrapped(createRequest('https://sploot.dev/api/gremlin'), defaultContext)
    ).rejects.toThrow('Route handler returned no response');

    expect(loggerRecords[0]?.logger.logError).toHaveBeenCalledWith(
      'request:error',
      expect.objectContaining({ message: 'Route handler returned no response' }),
      expect.objectContaining({ success: false }),
    );
  });

  it('honors custom operation override', async () => {
    nanoidMock.mockReturnValueOnce('trace-override');

    const response = createResponse(204);
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 200));
      return response;
    });

    const wrapped = withObservability(handler, { operation: 'upload:gremlin' });
    await wrapped(createRequest('https://sploot.dev/api/gremlin', 'PUT'), defaultContext);

    expect(getPerformanceMonitorMock).toHaveBeenCalledTimes(1);
    expect(measureAsyncMock).toHaveBeenCalledWith('upload:gremlin', expect.any(Function));

    const record = loggerRecords[0];
    expect(record?.traceId).toBe('trace-override');
    expect(record?.logger.logInfo).toHaveBeenCalledWith(
      'request:start',
      expect.objectContaining({ operation: 'upload:gremlin' })
    );
    expect(record?.logger.logTiming).toHaveBeenCalledWith(
      'upload:gremlin',
      200,
      true,
      expect.objectContaining({
        statusCode: 204,
        duration: 200,
        success: true,
      })
    );
  });

  it('marks non-success responses as failures in timing log', async () => {
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 1_500));
      return createResponse(500);
    });

    const wrapped = withObservability(handler);
    await wrapped(createRequest('https://sploot.dev/api/chaos'), defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logTiming).toHaveBeenCalledWith(
      '/api/chaos',
      1500,
      false,
      expect.objectContaining({
        statusCode: 500,
        success: false,
      })
    );
    expect(record?.logger.logError).toHaveBeenCalledWith(
      'request:server-error-status',
      expect.any(Error),
      expect.objectContaining({
        operation: '/api/chaos',
        statusCode: 500,
        success: false,
      })
    );
  });

  it('classifies typed embedding 503 responses without a duplicate Canary error', async () => {
    const handler = vi.fn(async () => ({
      status: 503,
      headers: new Headers({
        'Retry-After': '30',
        'X-Sploot-Embedding-Outcome': 'provider_circuit_open',
      }),
    }) as unknown as NextResponse);

    const wrapped = withObservability(handler);
    await wrapped(createRequest('https://sploot.dev/api/embedding'), defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logInfo).toHaveBeenCalledWith(
      'request:typed-embedding-outcome',
      expect.objectContaining({
        statusCode: 503,
        reason: 'provider_circuit_open',
      }),
    );
    expect(record?.logger.logError).not.toHaveBeenCalled();
  });

  it('honors a route-owned generic 500 marker without emitting a wrapper Canary report', async () => {
    const handler = vi.fn(async () => ({
      status: 500,
      headers: new Headers({
        'X-Sploot-Canary-Owner': 'route',
      }),
    }) as unknown as NextResponse);

    const wrapped = withObservability(handler);
    await wrapped(createRequest('https://sploot.dev/api/owned-error'), defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logError).not.toHaveBeenCalledWith(
      'request:server-error-status',
      expect.anything(),
      expect.anything(),
    );
  });

  it.each(['provider_rate_limit', 'provider_unavailable', 'global_rate'])(
    'classifies typed %s outcomes without generic 5xx logging',
    async (outcome) => {
      const handler = vi.fn(async () => ({
        status: 503,
        headers: new Headers({
          'Retry-After': '30',
          'X-Sploot-Embedding-Outcome': outcome,
        }),
      }) as unknown as NextResponse);

      const wrapped = withObservability(handler);
      await wrapped(createRequest('https://sploot.dev/api/embedding'), defaultContext);

      const record = loggerRecords[0];
      expect(record?.logger.logInfo).toHaveBeenCalledWith(
        'request:typed-embedding-outcome',
        expect.objectContaining({ reason: outcome, statusCode: 503 }),
      );
      expect(record?.logger.logError).not.toHaveBeenCalled();
    },
  );

  it('logs errors, invokes unstable_rethrow, and rethrows', async () => {
    const boom = new Error('sploot meltdown');
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 400));
      throw boom;
    });

    const wrapped = withObservability(handler);
    await expect(
      wrapped(createRequest('https://sploot.dev/api/error', 'DELETE'), defaultContext)
    ).rejects.toThrow(
      boom
    );

    expect(unstableRethrowMock).toHaveBeenCalledWith(boom);
    expect(measureAsyncMock).toHaveBeenCalled();

    const record = loggerRecords[0];
    expect(record?.logger.logError).toHaveBeenCalledWith(
      'request:error',
      boom,
      expect.objectContaining({
        method: 'DELETE',
        pathname: '/api/error',
        traceId: 'trace-test',
        duration: 400,
        success: false,
      })
    );
    expect(record?.logger.logTiming).not.toHaveBeenCalled();

    const logOrder = record?.logger.logError.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    const rethrowOrder = unstableRethrowMock.mock.invocationCallOrder[0] ?? 0;
    expect(logOrder).toBeGreaterThan(0);
    expect(logOrder).toBeLessThan(rethrowOrder);
  });

  it('skips logging when skipLogging is true', async () => {
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 300));
      return createResponse(200);
    });

    const wrapped = withObservability(handler, { skipLogging: true });
    await wrapped(createRequest('https://sploot.dev/api/nolog'), defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logInfo).not.toHaveBeenCalled();
    expect(record?.logger.logTiming).not.toHaveBeenCalled();
    expect(record?.logger.logError).not.toHaveBeenCalled();
  });

  it('omits performance monitor when skipTiming is true', async () => {
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 250));
      return createResponse(202);
    });

    const wrapped = withObservability(handler, { skipTiming: true });
    await wrapped(createRequest('https://sploot.dev/api/notiming'), defaultContext);

    expect(getPerformanceMonitorMock).not.toHaveBeenCalled();
    expect(measureAsyncMock).not.toHaveBeenCalled();

    const record = loggerRecords[0];
    expect(record?.logger.logTiming).toHaveBeenCalledWith(
      '/api/notiming',
      250,
      true,
      expect.objectContaining({
        statusCode: 202,
        duration: 250,
        success: true,
      })
    );
  });

  it('generates a unique trace id for every invocation', async () => {
    nanoidMock
      .mockImplementationOnce(() => 'trace-one')
      .mockImplementationOnce(() => 'trace-two');

    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(Date.now() + 500));
      return createResponse(200);
    });

    const wrapped = withObservability(handler);
    const req = createRequest('https://sploot.dev/api/twins');

    vi.setSystemTime(new Date(BASE_TIME));
    await wrapped(req, defaultContext);

    vi.setSystemTime(new Date(BASE_TIME));
    await wrapped(req, defaultContext);

    expect(loggerRecords.map(record => record.traceId)).toEqual(['trace-one', 'trace-two']);
  });

  it('merges custom metadata into log payloads', async () => {
    const handler = vi.fn(async () => {
      vi.setSystemTime(new Date(BASE_TIME + 600));
      return createResponse(200);
    });

    const metadata = { userId: 'user_123', featureFlag: 'goblin-mode' };
    const wrapped = withObservability(handler, { metadata });
    await wrapped(createRequest('https://sploot.dev/api/meta'), defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logInfo).toHaveBeenCalledWith(
      'request:start',
      expect.objectContaining(metadata)
    );
    expect(record?.logger.logTiming).toHaveBeenCalledWith(
      '/api/meta',
      600,
      true,
      expect.objectContaining(metadata)
    );
  });

  it('falls back to Request.url when nextUrl is missing', async () => {
    const handler = vi.fn(async (req: NextRequest, context: any) => {
      vi.setSystemTime(new Date(BASE_TIME + 120));
      return createResponse(204);
    });

    const wrapped = withObservability(handler);

    const plainRequest = new Request('https://sploot.dev/api/plain?gremlin=yes', {
      method: 'PATCH',
    });

    await wrapped(plainRequest as unknown as NextRequest, defaultContext);

    const record = loggerRecords[0];
    expect(record?.logger.logInfo).toHaveBeenCalledWith(
      'request:start',
      expect.objectContaining({
        method: 'PATCH',
        pathname: '/api/plain',
        query: { gremlin: 'yes' },
      })
    );
    expect(handler).toHaveBeenCalledWith(plainRequest, defaultContext);
  });
});
