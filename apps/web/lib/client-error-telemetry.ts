'use client';

import type { ErrorInfo } from 'react';
import { postClientError } from '@/lib/telemetry-client';
import type { ErrorTelemetryPayload } from '@/lib/telemetry-contract';

type TelemetryMetadata = Record<string, unknown>;

interface TelemetryOptions {
  errorInfo?: ErrorInfo;
  metadata?: TelemetryMetadata;
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_METADATA_STRING_LENGTH = 500;

export function sendClientErrorTelemetry(
  boundary: string,
  error: Error,
  options: TelemetryOptions = {}
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload = buildPayload(boundary, error, options);
    void postClientError(payload).catch(() => {
      /* telemetry is best effort */
    });
  } catch (telemetryError) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ClientErrorTelemetry] Failed to send telemetry', telemetryError);
    }
  }
}

function buildPayload(
  boundary: string,
  error: Error,
  { errorInfo, metadata }: TelemetryOptions
): Omit<ErrorTelemetryPayload, 'timestamp'> {
  const payload: Omit<ErrorTelemetryPayload, 'timestamp'> = {
    boundary,
    name: error.name || 'Error',
    message: sanitizeMessage(error.message),
    hasStack: Boolean(error.stack),
  };

  const location = getLocation();
  if (location) {
    payload.location = location;
  }

  if ('digest' in error && typeof (error as { digest?: unknown }).digest === 'string') {
    payload.digest = (error as { digest?: string }).digest;
  }

  if (errorInfo?.componentStack) {
    payload.hasComponentStack = true;
  }

  const sanitizedMetadata = sanitizeMetadata(metadata);
  if (sanitizedMetadata) {
    payload.metadata = sanitizedMetadata;
  }

  return payload;
}

function sanitizeMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return 'Unknown error';
  }

  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH)}...`
    : message;
}

function getLocation(): { origin: string; pathname: string } | null {
  try {
    const { origin, pathname } = window.location;
    return { origin, pathname };
  } catch {
    return null;
  }
}

function sanitizeMetadata(metadata?: TelemetryMetadata): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || key.toLowerCase().includes('stack')) {
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] =
        value.length > MAX_METADATA_STRING_LENGTH
          ? `${value.slice(0, MAX_METADATA_STRING_LENGTH)}...`
          : value;
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
      continue;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
