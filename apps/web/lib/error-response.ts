/**
 * Standardized error response builder for API routes.
 * Provides consistent error format with request tracing across all endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';

interface ErrorResponseBody {
  error: string;
  requestId: string;
  timestamp: string;
  path: string;
  details?: any;
}

/**
 * Create a standardized error response with request tracing.
 *
 * @param message - User-facing error message
 * @param requestId - Unique request ID for tracing (from middleware or generated)
 * @param req - Next.js request object (for path extraction)
 * @param details - Additional error details (only included in development)
 * @returns NextResponse with status 500 and structured error body
 *
 * @example
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   const requestId = crypto.randomUUID();
 *   try {
 *     // ... handler logic
 *   } catch (error) {
 *     logError('GET /api/assets', error, { requestId });
 *     return createErrorResponse(
 *       'Failed to fetch assets',
 *       requestId,
 *       req,
 *       error instanceof Error ? error.message : undefined
 *     );
 *   }
 * }
 * ```
 */
export function createErrorResponse(
  message: string,
  requestId: string,
  req: NextRequest,
  details?: any
): NextResponse<ErrorResponseBody> {
  const body: ErrorResponseBody = {
    error: message,
    requestId,
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
  };

  // Only include details in development for debugging
  if (process.env.NODE_ENV === 'development' && details !== undefined) {
    body.details = details;
  }

  return NextResponse.json(body, { status: 500 });
}
