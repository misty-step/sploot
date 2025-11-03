import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logger, withTraceId } from '@/lib/observability-logger';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('Observability Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('logInfo()', () => {
    it('should output JSON to console.log', () => {
      logger.logInfo('Test context', { foo: 'bar' });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe('info');
      expect(loggedData.context).toBe('Test context');
      expect(loggedData.metadata).toEqual({ foo: 'bar' });
      expect(loggedData.timestamp).toBeDefined();
      expect(loggedData.environment).toBeDefined();
    });

    it('should include environment context', () => {
      logger.logInfo('Test context');

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.environment).toHaveProperty('nodeEnv');
    });

    it('should work without metadata', () => {
      logger.logInfo('Test context');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.context).toBe('Test context');
      expect(loggedData.metadata).toBeUndefined();
    });
  });

  describe('logError()', () => {
    it('should output JSON to console.error', () => {
      const error = new Error('Test error');
      logger.logError('Error context', error, { userId: '123' });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe('error');
      expect(loggedData.context).toBe('Error context');
      expect(loggedData.error).toEqual({
        name: 'Error',
        message: 'Test error',
        stack: expect.any(String),
      });
      expect(loggedData.metadata).toEqual({ userId: '123' });
    });

    it('should call Sentry.captureException() with error and context', async () => {
      const error = new Error('Sentry test error');
      logger.logError('Sentry context', error, { requestId: '456' });

      // Wait for dynamic import to resolve
      await vi.waitFor(
        async () => {
          const Sentry = await import('@sentry/nextjs');
          expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error, {
            contexts: {
              custom: {
                context: 'Sentry context',
                traceId: undefined,
                requestId: '456',
              },
            },
          });
        },
        { timeout: 1000 }
      );
    });

    it('should handle Sentry unavailable gracefully', async () => {
      // Mock Sentry import to fail
      vi.doUnmock('@sentry/nextjs');
      vi.doMock('@sentry/nextjs', () => {
        throw new Error('Sentry not available');
      });

      const error = new Error('Test error');

      // Should not throw
      expect(() => {
        logger.logError('Error context', error);
      }).not.toThrow();

      // Should still log to console
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logTiming()', () => {
    it('should output JSON with duration, success, and operation', () => {
      logger.logTiming('upload:single', 1500, true, { size: 2048 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe('timing');
      expect(loggedData.operation).toBe('upload:single');
      expect(loggedData.duration).toBe(1500);
      expect(loggedData.success).toBe(true);
      expect(loggedData.metadata).toEqual({ size: 2048 });
    });

    it('should log failed operations', () => {
      logger.logTiming('search:query', 500, false);

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.success).toBe(false);
    });
  });

  describe('withTraceId()', () => {
    it('should create logger with traceId in all log entries', () => {
      const tracedLogger = withTraceId('trace-123');

      tracedLogger.logInfo('Info with trace');
      const infoLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(infoLog.traceId).toBe('trace-123');

      tracedLogger.logError('Error with trace', new Error('Test'));
      const errorLog = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(errorLog.traceId).toBe('trace-123');

      tracedLogger.logTiming('timing_with_trace', 100, true);
      const timingLog = JSON.parse(consoleLogSpy.mock.calls[1][0]);
      expect(timingLog.traceId).toBe('trace-123');
    });

    it('should create independent logger instances', () => {
      const logger1 = withTraceId('trace-1');
      const logger2 = withTraceId('trace-2');

      logger1.logInfo('Logger 1');
      logger2.logInfo('Logger 2');

      const log1 = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const log2 = JSON.parse(consoleLogSpy.mock.calls[1][0]);

      expect(log1.traceId).toBe('trace-1');
      expect(log2.traceId).toBe('trace-2');
    });

    it('should not include traceId in default logger', () => {
      logger.logInfo('No trace');

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.traceId).toBeUndefined();
    });
  });

  describe('Error serialization', () => {
    it('should serialize Error objects', () => {
      const error = new Error('Test error message');
      logger.logError('Error context', error);

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.error).toEqual({
        name: 'Error',
        message: 'Test error message',
        stack: expect.any(String),
      });
      expect(loggedData.error.stack).toContain('Test error message');
    });

    it('should serialize custom Error types', () => {
      const error = new TypeError('Type error');
      logger.logError('Type error context', error);

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.error.name).toBe('TypeError');
      expect(loggedData.error.message).toBe('Type error');
    });

    it('should serialize string errors', () => {
      logger.logError('String error context', 'Simple error string');

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.error).toEqual({
        name: 'Error',
        message: 'Simple error string',
      });
    });

    it('should serialize unknown error types', () => {
      logger.logError('Unknown error context', { weird: 'object' });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.error.name).toBe('UnknownError');
      expect(loggedData.error.message).toBe('[object Object]');
    });

    it('should serialize null/undefined errors', () => {
      logger.logError('Null error', null);

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.error.name).toBe('UnknownError');
      expect(loggedData.error.message).toBe('null');
    });
  });

  describe('JSON serialization', () => {
    it('should produce valid JSON for all log types', () => {
      logger.logInfo('Info test');
      logger.logError('Error test', new Error('Test'));
      logger.logTiming('timing_test', 100, true);

      // Should not throw when parsing
      expect(() => JSON.parse(consoleLogSpy.mock.calls[0][0])).not.toThrow();
      expect(() => JSON.parse(consoleErrorSpy.mock.calls[0][0])).not.toThrow();
      expect(() => JSON.parse(consoleLogSpy.mock.calls[1][0])).not.toThrow();
    });

    it('should include timestamp in ISO format', () => {
      logger.logInfo('Timestamp test');

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Metadata handling', () => {
    it('should include metadata in all log types', () => {
      const metadata = { requestId: 'req-123', userId: 'user-456' };

      logger.logInfo('Info with metadata', metadata);
      logger.logError('Error with metadata', new Error('Test'), metadata);
      logger.logTiming('timing_with_metadata', 100, true, metadata);

      const infoLog = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      const errorLog = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      const timingLog = JSON.parse(consoleLogSpy.mock.calls[1][0]);

      expect(infoLog.metadata).toEqual(metadata);
      expect(errorLog.metadata).toEqual(metadata);
      expect(timingLog.metadata).toEqual(metadata);
    });

    it('should handle complex metadata objects', () => {
      const metadata = {
        nested: { data: { here: true } },
        array: [1, 2, 3],
        mixed: { num: 42, str: 'test', bool: false },
      };

      logger.logInfo('Complex metadata', metadata);

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.metadata).toEqual(metadata);
    });
  });
});
