'use client';

import * as Sentry from '@sentry/nextjs';
import type { ErrorInfo } from 'react';
import { postClientError } from '@/lib/telemetry-client';
import type { ErrorTelemetryPayload } from '@/lib/telemetry-contract';

interface TelemetryOptions {
  errorInfo?: ErrorInfo;
}

export function sendClientErrorTelemetry(
  boundary: string,
  error: Error,
  options: TelemetryOptions = {}
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      scope.setTag('sploot.boundary', sanitizeErrorName(boundary));
      Sentry.captureException(error);
    });
  } catch {
    // Error reporting must not turn an error boundary into another error.
  }

  try {
    const payload = buildPayload(boundary, error, options);
    void postClientError(payload).catch(() => {
      /* telemetry is best effort */
    });
  } catch {
    // Structured logging is independent from Sentry delivery.
  }
}

function buildPayload(
  boundary: string,
  error: Error,
  { errorInfo }: TelemetryOptions
): Omit<ErrorTelemetryPayload, 'timestamp'> {
  const payload: Omit<ErrorTelemetryPayload, 'timestamp'> = {
    boundary,
    name: sanitizeErrorName(error.name),
    hasStack: Boolean(error.stack),
    hasComponentStack: Boolean(errorInfo?.componentStack),
  };

  return payload;
}

function sanitizeErrorName(name: unknown): string {
  if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,119}$/.test(name)) {
    return 'Error';
  }
  return name;
}
