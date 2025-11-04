import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@sentry/nextjs';

import { getAuth } from '@/lib/auth/server';
import { trackTiming } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';

type TelemetryRequest =
  | { type: 'error'; payload: ErrorPayload }
  | { type: 'performance'; payload: PerformancePayload }
  | { type: 'usage'; payload: UsagePayload };

interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  timestamp: number;
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

export async function POST(request: NextRequest): Promise<NextResponse<TelemetryResponse>> {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return respond({ success: false, message: 'unauthorized' }, 401);
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

    captureException(error, {
      contexts: {
        telemetry: {
          name: payload.name,
          stack: payload.stack,
          componentStack: payload.componentStack,
          url: payload.url,
          timestamp: payload.timestamp,
        },
      },
      user: { id: userId },
    });
  } catch (error) {
    logger.logError('telemetry:sentry-failure', error, { userId, payload });
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

  return (
    typeof payload.name === 'string' &&
    typeof payload.message === 'string' &&
    typeof payload.url === 'string' &&
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
