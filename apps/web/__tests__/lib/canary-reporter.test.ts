import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  CANARY_ENDPOINT: process.env.CANARY_ENDPOINT,
  CANARY_API_KEY: process.env.CANARY_API_KEY,
  CANARY_INGEST_KEY: process.env.CANARY_INGEST_KEY,
  CANARY_SERVICE_NAME: process.env.CANARY_SERVICE_NAME,
  CANARY_ENABLE_IN_TEST: process.env.CANARY_ENABLE_IN_TEST,
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
};

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.CANARY_ENDPOINT = 'https://canary.example.test';
  process.env.CANARY_API_KEY = 'test-canary-key';
  process.env.CANARY_SERVICE_NAME = 'sploot-test';
  process.env.CANARY_ENABLE_IN_TEST = '1';
  process.env.DEPLOYMENT_ENV = 'test';
});

afterEach(() => {
  vi.unstubAllGlobals();

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('canary reporter', () => {
  it('posts sanitized error payloads to Canary ingest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reportCanaryError } = await import('@/lib/canary-reporter');

    await expect(reportCanaryError({
      context: 'request:error',
      traceId: 'trace-123',
      error: {
        name: 'TypeError',
        message: 'Upload failed',
        stack: 'TypeError: Upload failed',
      },
      metadata: {
        pathname: '/api/upload',
        authorization: 'Bearer secret',
        nested: {
          sessionToken: 'secret-session',
          safe: 'value',
        },
      },
    })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://canary.example.test/api/v1/errors',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-canary-key',
          'X-API-Key': 'test-canary-key',
        }),
      })
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body).toMatchObject({
      service: 'sploot-test',
      error_class: 'TypeError',
      message: 'Upload failed',
      stack_trace: 'TypeError: Upload failed',
      severity: 'error',
      context: {
        source: 'sploot-web',
        context: 'request:error',
        trace_id: 'trace-123',
        environment: 'test',
      },
    });
    expect(body.context.metadata.authorization).toBe('[redacted]');
    expect(body.context.metadata.nested.sessionToken).toBe('[redacted]');
    expect(body.context.metadata.nested.safe).toBe('value');
  });

  it('reports not configured when endpoint or key is missing', async () => {
    delete process.env.CANARY_ENDPOINT;

    const { canaryConfigured, checkCanaryStatus } = await import('@/lib/canary-reporter');

    expect(canaryConfigured()).toBe(false);
    await expect(checkCanaryStatus()).resolves.toMatchObject({
      configured: false,
      reachable: null,
      status: 'not_configured',
    });
  });

  it('returns false when Canary rejects an error report', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const { reportCanaryError } = await import('@/lib/canary-reporter');

    await expect(reportCanaryError({
      context: 'request:error',
      error: { name: 'Error', message: 'rejected' },
    })).resolves.toBe(false);
  });

  it('posts health check-ins to Canary ingest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { reportCanaryCheckIn } = await import('@/lib/canary-reporter');

    await reportCanaryCheckIn({
      status: 'alive',
      summary: 'sploot-web health route ok',
      ttlMs: 300_000,
      context: {
        route: '/api/health',
        authorization: 'Bearer secret',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://canary.example.test/api/v1/check-ins',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-canary-key',
          'X-API-Key': 'test-canary-key',
        }),
      })
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(body).toMatchObject({
      monitor: 'sploot-test',
      status: 'alive',
      summary: 'sploot-web health route ok',
      ttl_ms: 300_000,
      context: {
        source: 'sploot-web',
        environment: 'test',
        route: '/api/health',
        authorization: '[redacted]',
      },
    });
  });
});
