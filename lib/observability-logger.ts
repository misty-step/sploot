/**
 * Observability Logger - Structured logging with traceId correlation
 *
 * Outputs plain JSON to console for Vercel log aggregation.
 * Integrates with Sentry for error tracking.
 */

interface ObservabilityLogger {
  logInfo(context: string, metadata?: Record<string, any>): void;
  logError(context: string, error: unknown, metadata?: Record<string, any>): void;
  logTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
}

function createLogger(traceId?: string): ObservabilityLogger {
  const environment = {
    nodeEnv: process.env.NODE_ENV,
    vercelRegion: process.env.VERCEL_REGION,
    vercelUrl: process.env.VERCEL_URL,
  };

  return {
    logInfo(context: string, metadata?: Record<string, any>): void {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        context,
        traceId,
        metadata,
        environment,
      };

      console.log(JSON.stringify(entry));
    },

    logError(context: string, error: unknown, metadata?: Record<string, any>): void {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'error' as const,
        context,
        traceId,
        error: serializeError(error),
        metadata,
        environment,
      };

      console.error(JSON.stringify(entry));

      // Send to Sentry if available
      import('@sentry/nextjs')
        .then(Sentry => {
          Sentry.captureException(error, {
            contexts: {
              custom: {
                context,
                traceId,
                ...metadata,
              },
            },
          });
        })
        .catch(() => {
          // Sentry unavailable, already logged to console
        });
    },

    logTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'timing' as const,
        operation,
        duration,
        success,
        traceId,
        metadata,
        environment,
      };

      console.log(JSON.stringify(entry));
    },
  };
}

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

export const logger = createLogger();
export const withTraceId = createLogger;
