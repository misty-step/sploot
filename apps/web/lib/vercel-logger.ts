/**
 * Vercel-compatible structured logging utility.
 * Outputs plain JSON to console.error for production error tracking.
 *
 * Why this exists: The custom logger (lib/logger.ts) uses ANSI color codes
 * and custom formatting that Vercel's log aggregation cannot parse properly,
 * resulting in empty error messages in production logs.
 *
 * This logger outputs plain JSON that Vercel can capture and index.
 */

interface ErrorLogEntry {
  timestamp: string;
  context: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
  environment: {
    nodeEnv?: string;
    vercelRegion?: string;
    vercelUrl?: string;
  };
}

/**
 * Log an error with structured context for Vercel production debugging.
 *
 * @param context - Descriptive context (e.g., "GET /api/assets", "POST /api/upload")
 * @param error - The error object or message to log
 * @param metadata - Additional context (request params, user ID, etc.)
 *
 * @example
 * ```typescript
 * try {
 *   const data = await riskyOperation();
 * } catch (error) {
 *   logError('POST /api/assets', error, {
 *     assetId: '123',
 *     userId: 'user_456'
 *   });
 *   throw error;
 * }
 * ```
 */
export function logError(
  context: string,
  error: unknown,
  metadata?: Record<string, any>
): void {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    context,
    error: serializeError(error),
    metadata,
    environment: {
      nodeEnv: process.env.NODE_ENV,
      vercelRegion: process.env.VERCEL_REGION,
      vercelUrl: process.env.VERCEL_URL,
    },
  };

  // Output plain JSON to console.error - Vercel captures this
  console.error(JSON.stringify(entry));
}

/**
 * Serialize error to plain object with name, message, and stack trace.
 * Handles Error objects, strings, and unknown types.
 */
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
