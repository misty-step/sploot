import { NextResponse } from 'next/server';
import type { SplootApiError } from '@sploot/common';
import { CostAdmissionError } from './errors';

/** Retry-After header for a denied CostAdmissionError; omitted for a hard file-size cap. */
export function costAdmissionRetryHeaders(error: CostAdmissionError): HeadersInit | undefined {
  if (error.reason === 'file_too_large') return undefined;
  return { 'Retry-After': String(error.retryAfterSec) };
}

/** Standard JSON error response for a CostAdmissionError, shared across every route it can surface from. */
export function costAdmissionErrorResponse(error: CostAdmissionError): NextResponse {
  const body: SplootApiError & { reason: string } = {
    error: error.message,
    code: 'cost_admission_denied',
    retryable: error.retryable,
    reason: error.reason,
    action: { type: 'try_later', label: 'Try again later' },
  };
  return NextResponse.json(body, { status: error.statusCode, headers: costAdmissionRetryHeaders(error) });
}
