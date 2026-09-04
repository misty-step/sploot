import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const FIXED_DATE = new Date('2024-04-20T16:20:42.000Z');
const originalNodeEnv = process.env.NODE_ENV;

type ConsoleSpy = ReturnType<typeof vi.spyOn>;

let consoleLogSpy: ConsoleSpy;
let consoleErrorSpy: ConsoleSpy;

async function importLogger(sentryFactory?: () => unknown) {
  vi.doMock(
    '@/lib/sentry',
    sentryFactory ??
      (() => ({
        captureOperationalError: vi.fn(),
      }))
  );

  return import('@/lib/observability-logger');
}

function parseCall(spy: ConsoleSpy, index = 0) {
  const [payload] = spy.mock.calls[index] ?? [];
  return JSON.parse(payload as string);
}


beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_DATE);

  process.env.NODE_ENV = 'test';

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();

  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  vi.doUnmock('@/lib/sentry');
});

describe('observability logger', () => {
  it('logs info entries as structured JSON', async () => {
    const { logger } = await importLogger();

    logger.logInfo('goblin-mode-ping', { vibe: 'certified' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    const entry = parseCall(consoleLogSpy);

    expect(entry).toMatchObject({
      timestamp: FIXED_DATE.toISOString(),
      level: 'info',
      context: 'goblin-mode-ping',
      metadata: { vibe: 'certified' },
      environment: {
        nodeEnv: 'test',
      },
    });
    expect(entry.traceId).toBeUndefined();
  });

  it('logs errors to console.error with normalized Error payloads', async () => {
    const { logger } = await importLogger();
    const boom = new Error('the vibes imploded');

    logger.logError('panic-signal', boom, { requestId: 'req-123' });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    const entry = parseCall(consoleErrorSpy);

    expect(entry.level).toBe('error');
    expect(entry.context).toBe('panic-signal');
    expect(entry.metadata).toEqual({ requestId: 'req-123' });
    expect(entry.error).toMatchObject({
      name: 'Error',
      message: 'the vibes imploded',
    });
    expect(entry.error.stack).toContain('Error: the vibes imploded');
  });

  it('forwards server errors to Sentry with their bounded context', async () => {
    const { logger } = await importLogger();
    const sentry = await import('@/lib/sentry');
    const err = new Error('upload queue failed');

    logger.logError('upload:failed', err, { requestId: 'req-123' });

    expect(vi.mocked(sentry.captureOperationalError)).toHaveBeenCalledWith({
      context: 'upload:failed',
      traceId: undefined,
      metadata: { requestId: 'req-123' },
      error: expect.objectContaining({
        name: 'Error',
        message: 'upload queue failed',
      }),
    });
  });

  it('logs timing entries with duration and success fields', async () => {
    const { logger } = await importLogger();

    logger.logTiming('upload:mainframe', 420, true, { attempts: 1 });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);

    const entry = parseCall(consoleLogSpy);

    expect(entry).toMatchObject({
      level: 'timing',
      context: 'upload:mainframe',
      operation: 'upload:mainframe',
      duration: 420,
      success: true,
      metadata: { attempts: 1 },
    });
  });

  it('propagates traceId through withTraceId helper', async () => {
    const { withTraceId } = await importLogger();
    const tracedLogger = withTraceId('trace-hyperpop');

    tracedLogger.logInfo('info-trace');
    tracedLogger.logTiming('timing-trace', 69, false);
    tracedLogger.logError('error-trace', 'string failure');

    expect(parseCall(consoleLogSpy).traceId).toBe('trace-hyperpop');
    expect(parseCall(consoleLogSpy, 1).traceId).toBe('trace-hyperpop');
    expect(parseCall(consoleErrorSpy).traceId).toBe('trace-hyperpop');
  });

  it('exposes trace ids via getTraceId', async () => {
    const { logger, withTraceId } = await importLogger();

    expect(logger.getTraceId()).toBeUndefined();

    const tracedLogger = withTraceId('trace-sparkle');
    expect(tracedLogger.getTraceId()).toBe('trace-sparkle');
  });

  it('serializes Error instances with name, message, and stack', async () => {
    const { logger } = await importLogger();
    const typeBoom = new TypeError('weird type gremlin');

    logger.logError('type-chaos', typeBoom);

    const entry = parseCall(consoleErrorSpy);

    expect(entry.error.name).toBe('TypeError');
    expect(entry.error.message).toBe('weird type gremlin');
    expect(entry.error.stack).toContain('TypeError: weird type gremlin');
  });

  it('serializes string errors to generic Error payloads', async () => {
    const { logger } = await importLogger();

    logger.logError('string-chaos', 'no stack for you');

    const entry = parseCall(consoleErrorSpy);

    expect(entry.error).toEqual({
      name: 'Error',
      message: 'no stack for you',
    });
  });

  it('keeps structured logging when Sentry rejects capture', async () => {
    const { logger } = await importLogger(() => ({
      captureOperationalError: vi.fn(() => false),
    }));
    const kaboom = new Error('goodbye telemetry');

    expect(() => logger.logError('sentry-offline', kaboom)).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const entry = parseCall(consoleErrorSpy);
    expect(entry.error.message).toBe('goodbye telemetry');
  });

  it('falls back to minimal payload when metadata serialization fails', async () => {
    const { logger } = await importLogger();
    const loopy: Record<string, unknown> = {};
    loopy.self = loopy;

    logger.logInfo('loop-chaos', loopy);

    const entry = parseCall(consoleLogSpy);
    expect(entry.level).toBe('info');
    expect(entry.context).toBe('loop-chaos');
    expect(entry.metadata).toBeUndefined();
    expect(entry.serializationError).toMatchObject({
      name: 'TypeError',
    });
  });

  it('top-level helpers proxy to the default logger instance', async () => {
    const { logInfo, logError, logTiming } = await importLogger();

    logInfo('helper-info', { blitz: true });
    expect(parseCall(consoleLogSpy).context).toBe('helper-info');

    const boom = new Error('helper kaboom');
    logError('helper-error', boom);
    expect(parseCall(consoleErrorSpy).context).toBe('helper-error');

    logTiming('helper-timing', 1337, true);
    expect(parseCall(consoleLogSpy, 1)).toMatchObject({
      operation: 'helper-timing',
      success: true,
    });
  });
});
