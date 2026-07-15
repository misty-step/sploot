import { nanoid } from 'nanoid';
import { unstable_rethrow } from 'next/navigation';
import type { NextRequest, NextResponse } from 'next/server';

import { withTraceId } from './observability-logger';
import { getPerformanceMonitor } from './performance-monitor';
import {
  enrollmentDeniedResponse,
  enrollmentIdentityConflictResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
  isEnrollmentIdentityConflictError,
} from './enrollment/enrollment-policy';

/**
 * Next.js route handler signature extended with optional context param.
 *
 * @public
 */
type HandlerWithContext = (
  req: NextRequest,
  context: RouteContext
) => Promise<Response | NextResponse<any>>;

type HandlerWithoutContext = (
  req: NextRequest
) => Promise<Response | NextResponse<any>>;

export type RouteHandler = HandlerWithContext | HandlerWithoutContext;

export type InstrumentedRouteHandler = (
  req: NextRequest,
  context: RouteContext
) => Promise<Response | NextResponse<any>>;

/**
 * Additional context provided by the App Router when invoking a route handler.
 *
 * @public
 */
export interface RouteContext {
  params: Promise<Record<string, string>>;
}

/**
 * Options that tune how {@link withObservability} instruments a request handler.
 *
 * @public
 */
export interface ObservabilityOptions {
  operation?: string;
  skipTiming?: boolean;
  skipLogging?: boolean;
  metadata?: Record<string, any>;
}

interface RequestMetadata {
  method: string;
  pathname: string;
  traceId: string;
  query?: Record<string, string>;
  statusCode?: number;
  duration?: number;
  success?: boolean;
}

const TRACE_ID_LENGTH = 12;
const DEFAULT_ROUTE_CONTEXT: RouteContext = Object.freeze({ params: Promise.resolve({}) });

/**
 * Wrap a Next.js route handler with logging, timing, and trace enrichment.
 *
 * @param handler - Route handler to instrument.
 * @param options - Observability configuration for the route.
 * @returns Instrumented route handler.
 */
export function withObservability(
  handler: RouteHandler,
  options: ObservabilityOptions = {}
): InstrumentedRouteHandler {
  return async function wrappedHandler(
    req: NextRequest,
    context: RouteContext
  ): Promise<Response | NextResponse<any>> {
    const handlerContext = context ?? DEFAULT_ROUTE_CONTEXT;
    const traceId = generateTraceId();
    const operation = resolveOperation(options.operation, req);
    const startTime = Date.now();
    const logger = withTraceId(traceId);
    const query = extractQuery(req);
    const metadata = createBaseMetadata(req, traceId, query, options.metadata);
    const shouldLog = options.skipLogging !== true;
    const perfMonitor = options.skipTiming ? null : getPerformanceMonitor();

    if (shouldLog) {
      try {
        logger.logInfo('request:start', {
          ...metadata,
          operation,
        });
      } catch {
        // Silently ignore logging failures
      }
    }

    try {
      const response = perfMonitor
        ? await perfMonitor.measureAsync(operation, () => callRouteHandler(handler, req, handlerContext))
        : await callRouteHandler(handler, req, handlerContext);
      const duration = Date.now() - startTime;
      const statusCode = response.status;
      const success = statusCode >= 200 && statusCode < 400;

      if (shouldLog) {
        try {
          logger.logTiming(operation, duration, success, {
            ...metadata,
            statusCode,
            duration,
            success,
          });

          if (statusCode >= 500) {
            logger.logError(
              'request:server-error-status',
              new Error(`Request completed with HTTP ${statusCode}`),
              {
                ...metadata,
                operation,
                statusCode,
                duration,
                success,
              }
            );
          }
        } catch {
          // Silently ignore logging failures
        }
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const logPayload = {
        ...metadata,
        operation,
        duration,
        success: false,
      };

      if (shouldLog) {
        try {
          logger.logError('request:error', error, logPayload);
        } catch {
          // Silently ignore logging failures
        }
      }

      if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
      if (isEnrollmentUnavailableError(error)) return enrollmentUnavailableResponse();
      if (isEnrollmentIdentityConflictError(error)) return enrollmentIdentityConflictResponse();

      unstable_rethrow(error);
      throw error;
    }
  };
}

function callRouteHandler(
  handler: RouteHandler,
  req: NextRequest,
  context: RouteContext
): Promise<Response | NextResponse<any>> {
  if (handler.length >= 2) {
    return (handler as HandlerWithContext)(req, context);
  }

  return (handler as HandlerWithoutContext)(req);
}

function generateTraceId(): string {
  try {
    return nanoid(TRACE_ID_LENGTH);
  } catch (error) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto
        .randomUUID()
        .replace(/-/g, '')
        .slice(0, TRACE_ID_LENGTH);
    }

    return Math.random().toString(36).slice(2, 2 + TRACE_ID_LENGTH);
  }
}

function resolveOperation(operation: string | undefined, req: NextRequest | Request): string {
  if (operation) {
    return operation;
  }

  return resolvePathname(req) ?? 'unknown-operation';
}

function extractQuery(req: NextRequest | Request): Record<string, string> | undefined {
  const entries = Array.from(getSearchParams(req));
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function createBaseMetadata(
  req: NextRequest | Request,
  traceId: string,
  query: Record<string, string> | undefined,
  extra?: Record<string, any>
): RequestMetadata & Record<string, any> {
  return {
    method: req.method ?? 'GET',
    pathname: resolvePathname(req) ?? 'unknown-pathname',
    traceId,
    ...(query ? { query } : {}),
    ...(extra ?? {}),
  };
}

function resolvePathname(req: NextRequest | Request): string | undefined {
  if (hasNextUrl(req)) {
    return req.nextUrl.pathname;
  }

  const url = getRequestUrl(req);
  return url?.pathname;
}

function getSearchParams(req: NextRequest | Request): Iterable<[string, string]> {
  if (hasNextUrl(req)) {
    return req.nextUrl.searchParams.entries();
  }

  const url = getRequestUrl(req);
  return url ? url.searchParams.entries() : [];
}

function hasNextUrl(req: NextRequest | Request): req is NextRequest {
  return typeof (req as NextRequest).nextUrl !== 'undefined';
}

function getRequestUrl(req: Request | NextRequest): URL | null {
  if ('url' in req && typeof req.url === 'string') {
    try {
      return new URL(req.url);
    } catch {
      return null;
    }
  }

  return null;
}
