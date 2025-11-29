import { NextResponse } from 'next/server';

/**
 * Standardized error codes for share API endpoints
 */
export type ShareErrorCode = 'NOT_FOUND' | 'UNAUTHORIZED' | 'DELETED' | 'INTERNAL_ERROR';

/**
 * Error response structure returned to clients
 */
interface ErrorResponse {
  error: string;
  code: ShareErrorCode;
  requestId: string;
  timestamp: string;
}

/**
 * Map error codes to HTTP status codes
 */
const STATUS_CODES: Record<ShareErrorCode, number> = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  DELETED: 404,
  INTERNAL_ERROR: 500,
};

/**
 * Create a standardized error response for share endpoints
 *
 * @param code - Error code indicating the type of error
 * @param userMessage - User-friendly error message (no technical details)
 * @returns NextResponse with standardized error JSON
 *
 * @example
 * ```typescript
 * return apiError('NOT_FOUND', 'Asset not found');
 * // Returns 404 with { error: 'Asset not found', code: 'NOT_FOUND', ... }
 * ```
 */
export function apiError(code: ShareErrorCode, userMessage: string): NextResponse {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const status = STATUS_CODES[code];

  const response: ErrorResponse = {
    error: userMessage,
    code,
    requestId,
    timestamp,
  };

  // Log server-side for debugging (without exposing to client)
  console.error('[API Error]', {
    code,
    status,
    message: userMessage,
    requestId,
    timestamp,
  });

  return NextResponse.json(response, { status });
}
