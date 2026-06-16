import { NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth/server';
import { unauthorizedResponse } from '@/lib/auth/api';
import { trackTiming } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';

type TelemetryRequest =
  | { type: 'error'; payload: ErrorPayload }
  | { type: 'performance'; payload: PerformancePayload }
  | { type: 'usage'; payload: UsagePayload };

interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  location?: {
    origin: string;
    pathname: string;
  };
  boundary?: string;
  hasStack?: boolean;
  hasComponentStack?: boolean;
  digest?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface PerformancePayload {
  operation: string;
  duration: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

interface UsagePayload {
  userId: string;
  action: string;
  count: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface TelemetryResponse {
  success: boolean;
  message?: string;
}

async function postHandler(request: NextRequest): Promise<NextResponse> {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return unauthorizedResponse();
    }

    const body = await safeJson(request);
    if (!body) {
      return respond({ success: false, message: 'invalid json' }, 400);
    }

    if (!isTelemetryRequest(body)) {
      return respond({ success: false, message: 'invalid payload' }, 400);
    }

    await forwardTelemetry(body, userId);

    return respond({ success: true }, 200);
  } catch (error) {
    logger.logError('telemetry:unhandled', error);
    return respond({ success: true }, 200);
  }
}

async function forwardTelemetry(request: TelemetryRequest, userId: string): Promise<void> {
  switch (request.type) {
    case 'error':
      forwardErrorTelemetry(request.payload, userId);
      break;
    case 'performance':
      forwardPerformanceTelemetry(request.payload);
      break;
    case 'usage':
      forwardUsageTelemetry(request.payload, userId);
      break;
  }
}

function forwardErrorTelemetry(payload: ErrorPayload, userId: string): void {
  try {
    const error = new Error(payload.message);
    error.name = payload.name;
    if (payload.stack) {
      error.stack = payload.stack;
    }

    logger.logError('client:error', error, {
      userId,
      name: payload.name,
      url: payload.url,
      location: payload.location,
      boundary: payload.boundary,
      digest: payload.digest,
      timestamp: payload.timestamp,
      hasStack: payload.hasStack ?? Boolean(payload.stack),
      hasComponentStack: payload.hasComponentStack ?? Boolean(payload.componentStack),
      metadata: payload.metadata,
    });
  } catch (error) {
    logger.logError('telemetry:canary-forwarding-failed', error, { userId, payload });
  }
}

function forwardPerformanceTelemetry(payload: PerformancePayload): void {
  try {
    trackTiming(payload.operation, payload.duration, payload.success, payload.metadata);
  } catch (error) {
    logger.logError('telemetry:performance-forwarding-failed', error, {
      operation: payload.operation,
    });
  }
}

function forwardUsageTelemetry(payload: UsagePayload, userId: string): void {
  try {
    logger.logInfo('usage_metric', {
      ...payload,
      userId,
    });
  } catch (error) {
    logger.logError('telemetry:usage-forwarding-failed', error, { userId });
  }
}

async function safeJson(request: NextRequest): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function respond(body: TelemetryResponse, status: number): NextResponse<TelemetryResponse> {
  return NextResponse.json(body, { status });
}

function isTelemetryRequest(value: unknown): value is TelemetryRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (!('type' in value) || !('payload' in value)) {
    return false;
  }

  const { type, payload } = value as { type: unknown; payload: unknown };

  switch (type) {
    case 'error':
      return isErrorPayload(payload);
    case 'performance':
      return isPerformancePayload(payload);
    case 'usage':
      return isUsagePayload(payload);
    default:
      return false;
  }
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof ErrorPayload, unknown>>;
  const hasLocation =
    typeof payload.location === 'object' &&
    payload.location !== null &&
    typeof (payload.location as { origin?: unknown }).origin === 'string' &&
    typeof (payload.location as { pathname?: unknown }).pathname === 'string';

  return (
    typeof payload.name === 'string' &&
    typeof payload.message === 'string' &&
    (typeof payload.url === 'string' || hasLocation) &&
    typeof payload.timestamp === 'number'
  );
}

function isPerformancePayload(value: unknown): value is PerformancePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof PerformancePayload, unknown>>;

  return (
    typeof payload.operation === 'string' &&
    typeof payload.duration === 'number' &&
    typeof payload.success === 'boolean'
  );
}

function isUsagePayload(value: unknown): value is UsagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof UsagePayload, unknown>>;

  return (
    typeof payload.userId === 'string' &&
    typeof payload.action === 'string' &&
    typeof payload.count === 'number' &&
    typeof payload.timestamp === 'number'
  );
}

export const POST = withObservability(postHandler, { operation: 'telemetry:ingest' });
