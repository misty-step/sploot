type LogLevel = 'info' | 'error' | 'timing';

interface BaseLogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  traceId?: string;
  metadata?: Record<string, any>;
  environment: {
    nodeEnv?: string;
    vercelRegion?: string;
    vercelUrl?: string;
  };
}

interface InfoLogEntry extends BaseLogEntry {
  level: 'info';
}

interface ErrorLogEntry extends BaseLogEntry {
  level: 'error';
  error: SerializedError;
}

interface TimingLogEntry extends BaseLogEntry {
  level: 'timing';
  operation: string;
  duration: number;
  success: boolean;
}

type LogEntry = InfoLogEntry | ErrorLogEntry | TimingLogEntry;

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

type ConsoleWriter = ((message?: any, ...optionalParams: any[]) => void) | undefined;

interface SentryModule {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
}

/**
 * Structured logger that writes JSON logs, forwards errors to Sentry, and preserves trace context.
 *
 * @public
 */
export interface ObservabilityLogger {
  logInfo(context: string, metadata?: Record<string, any>): void;
  logError(context: string, error: unknown, metadata?: Record<string, any>): void;
  logTiming(operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void;
  getTraceId(): string | undefined;
}

let sentryLoader: Promise<SentryModule | null> | null = null;

function loadSentry(): Promise<SentryModule | null> {
  if (sentryLoader === null) {
    sentryLoader = import('@sentry/nextjs')
      .then(module => module as SentryModule)
      .catch(() => null);
  }

  return sentryLoader;
}

function getEnvironment() {
  return {
    nodeEnv: process.env.NODE_ENV,
    vercelRegion: process.env.VERCEL_REGION,
    vercelUrl: process.env.VERCEL_URL,
  };
}

function serializeError(error: unknown): SerializedError {
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
    message:
      error === null
        ? 'null'
        : typeof error === 'undefined'
        ? 'undefined'
        : String(error),
  };
}

class ObservabilityLoggerImpl implements ObservabilityLogger {
  constructor(private readonly traceId?: string) {}

  logInfo(context: string, metadata?: Record<string, any>): void {
    const entry: InfoLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      context,
      traceId: this.traceId,
      metadata,
      environment: getEnvironment(),
    };

    this.emit(entry, getConsoleWriter('info'));
  }

  logError(context: string, error: unknown, metadata?: Record<string, any>): void {
    const serializedError = serializeError(error);

    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      context,
      traceId: this.traceId,
      metadata,
      environment: getEnvironment(),
      error: serializedError,
    };

    this.emit(entry, getConsoleWriter('error'));

    const sentryContext = {
      context,
      traceId: this.traceId,
      ...metadata,
    };

    void loadSentry().then(sentry => {
      try {
        sentry?.captureException(error, {
          contexts: { custom: sentryContext },
        });
      } catch {
        // Sentry capture should never throw for callers
      }
    });
  }

  logTiming(
    operation: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, any>
  ): void {
    const entry: TimingLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'timing',
      context: operation,
      operation,
      duration,
      success,
      traceId: this.traceId,
      metadata,
      environment: getEnvironment(),
    };

    this.emit(entry, getConsoleWriter('info'));
  }

  getTraceId(): string | undefined {
    return this.traceId;
  }

  private emit(entry: LogEntry, writer: ConsoleWriter): void {
    if (typeof writer !== 'function') {
      return;
    }

    try {
      writer(JSON.stringify(entry));
    } catch (serializationError) {
      const fallbackEntry = {
        timestamp: entry.timestamp,
        level: entry.level,
        context: entry.context,
        traceId: entry.traceId,
        environment: entry.environment,
        serializationError: serializeError(serializationError),
      };

      try {
        writer(JSON.stringify(fallbackEntry));
      } catch {
        // Final fallback: swallow logging failure to avoid crashing callers
      }
    }
  }
}

function getConsoleWriter(level: LogLevel): ConsoleWriter {
  if (typeof console === 'undefined') {
    return undefined;
  }

  if (level === 'error') {
    return typeof console.error === 'function' ? console.error.bind(console) : undefined;
  }

  return typeof console.log === 'function' ? console.log.bind(console) : undefined;
}

function createLogger(traceId?: string): ObservabilityLogger {
  return new ObservabilityLoggerImpl(traceId);
}

/**
 * Shared logger instance without an explicit trace id.
 *
 * @public
 */
export const logger = createLogger();

/**
 * Log an informational message with optional metadata.
 *
 * @param context - Short description of the event.
 * @param metadata - Optional structured payload.
 */
export function logInfo(context: string, metadata?: Record<string, any>): void {
  logger.logInfo(context, metadata);
}

/**
 * Log an error, serialize it for JSON output, and forward it to Sentry.
 *
 * @param context - Short description of the failure.
 * @param error - Error object or primitive describing the failure.
 * @param metadata - Optional structured payload.
 */
export function logError(context: string, error: unknown, metadata?: Record<string, any>): void {
  logger.logError(context, error, metadata);
}

/**
 * Log a timing measurement for an operation.
 *
 * @param operation - Operation identifier (usually matches analytics naming).
 * @param duration - Duration in milliseconds.
 * @param success - Whether the operation succeeded.
 * @param metadata - Optional contextual data to append.
 */
export function logTiming(
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, any>
): void {
  logger.logTiming(operation, duration, success, metadata);
}

/**
 * Create a logger bound to a specific trace id for request-scoped logging.
 *
 * @param traceId - Stable identifier shared across telemetry.
 * @returns Logger instance namespaced to the provided trace id.
 */
export function withTraceId(traceId: string): ObservabilityLogger {
  return createLogger(traceId);
}
