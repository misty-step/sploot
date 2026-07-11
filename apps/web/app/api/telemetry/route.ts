import { NextRequest, NextResponse } from 'next/server';

import { getAnalyticsPropertyAllowlist } from '@/lib/analytics';
import { getAuth } from '@/lib/auth/server';
import { unauthorizedResponse } from '@/lib/auth/api';
import { logger } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';
import {
  isPerformanceMetricName,
  isPerformanceMetricUnit,
  type AnalyticsTelemetryPayload as AnalyticsPayload,
  type ErrorTelemetryPayload as ErrorPayload,
  type PerformanceTelemetryPayload as PerformancePayload,
  type TelemetryRequest,
  type UsageTelemetryPayload as UsagePayload,
} from '@/lib/telemetry-contract';

interface TelemetryResponse {
  success: boolean;
  message?: string;
}

type TelemetryPrimitive = string | number | boolean;

const TELEMETRY_SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|session|email|user(?:_|-)?id|account(?:_|-)?id|clerk)/i;
const TELEMETRY_CONTENT_KEY = /^(query|search(?:Query|Term|Text)|search[_-](?:query|term|text))$/i;
const TELEMETRY_URL_KEY = /^(url|referrer|href)$/i;
const EMAIL_VALUE = /\S+@\S+\.\S+/;
const MAX_TELEMETRY_METADATA_ENTRIES = 30;
const MAX_TELEMETRY_KEY_LENGTH = 80;
const MAX_TELEMETRY_STRING_LENGTH = 2_000;
const MAX_ERROR_IDENTIFIER_LENGTH = 120;
const SAFE_ERROR_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

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
      forwardUsageTelemetry(request.payload);
      break;
    case 'analytics':
      forwardAnalyticsTelemetry(request.payload);
      break;
  }
}

function forwardAnalyticsTelemetry(payload: AnalyticsPayload): void {
  try {
    logger.logInfo('analytics:event', {
      name: payload.name,
      properties: sanitizeAnalyticsProperties(payload.name, payload.properties),
      timestamp: payload.timestamp,
    });
  } catch (error) {
    logger.logError('telemetry:analytics-forwarding-failed', error);
  }
}

function sanitizeAnalyticsProperties(
  name: string,
  properties: AnalyticsPayload['properties']
): AnalyticsPayload['properties'] {
  const allowlist = getAnalyticsPropertyAllowlist(name);
  if (!allowlist) return {};

  const allowedProperties = Object.fromEntries(
    allowlist
      .filter((key) => Object.prototype.hasOwnProperty.call(properties, key))
      .map((key) => [key, properties[key]])
  );

  return sanitizeTelemetryMetadata(allowedProperties);
}

function forwardErrorTelemetry(payload: ErrorPayload, userId: string): void {
  try {
    // Browser error text and stacks are untrusted free text. Preserve only
    // bounded structural signal; never forward their raw contents to logs.
    const error = new Error('Client-reported error');
    error.name = sanitizeErrorIdentifier(payload.name) ?? 'ClientError';

    logger.logError('client:error', error, {
      userId,
      name: error.name,
      url: sanitizeTelemetryUrl(payload.url),
      location: sanitizeTelemetryLocation(payload.location),
      boundary: sanitizeErrorIdentifier(payload.boundary),
      digest: sanitizeErrorIdentifier(payload.digest),
      timestamp: payload.timestamp,
      hasStack: payload.hasStack ?? Boolean(payload.stack),
      hasComponentStack: payload.hasComponentStack ?? Boolean(payload.componentStack),
      metadata: sanitizeOptionalTelemetryMetadata(payload.metadata),
    });
  } catch (error) {
    logger.logError('telemetry:canary-forwarding-failed', error, {
      name: sanitizeErrorIdentifier(payload.name) ?? 'ClientError',
    });
  }
}

function sanitizeErrorIdentifier(value: string | undefined): string | undefined {
  if (
    !value ||
    value.length > MAX_ERROR_IDENTIFIER_LENGTH ||
    !SAFE_ERROR_IDENTIFIER.test(value) ||
    TELEMETRY_SENSITIVE_KEY.test(value)
  ) {
    return undefined;
  }
  return value;
}

function sanitizeTelemetryUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withoutQuery = stripQueryParams(value);
  return EMAIL_VALUE.test(withoutQuery) || TELEMETRY_SENSITIVE_KEY.test(withoutQuery)
    ? '[REDACTED]'
    : withoutQuery;
}

function sanitizeTelemetryLocation(
  location: ErrorPayload['location']
): ErrorPayload['location'] | undefined {
  if (!location) return undefined;

  let origin: string;
  try {
    origin = new URL(location.origin).origin;
  } catch {
    origin = stripQueryParams(location.origin);
  }

  const pathname = location.pathname.split(/[?#]/, 1)[0];
  return {
    origin:
      EMAIL_VALUE.test(origin) || TELEMETRY_SENSITIVE_KEY.test(origin)
        ? '[REDACTED]'
        : origin,
    pathname:
      EMAIL_VALUE.test(pathname) || TELEMETRY_SENSITIVE_KEY.test(pathname)
        ? '[REDACTED]'
        : pathname,
  };
}

function forwardPerformanceTelemetry(payload: PerformancePayload): void {
  try {
    logger.logInfo('performance_metric', {
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit,
      timestamp: payload.timestamp,
      tags: sanitizeOptionalTelemetryMetadata(payload.tags),
    });
  } catch (error) {
    logger.logError('telemetry:performance-forwarding-failed', error, {
      metric: payload.metric,
    });
  }
}

function forwardUsageTelemetry(payload: UsagePayload): void {
  try {
    logger.logInfo('usage_metric', {
      action: payload.action,
      count: payload.count,
      timestamp: payload.timestamp,
      metadata: sanitizeOptionalTelemetryMetadata(payload.metadata),
    });
  } catch (error) {
    logger.logError('telemetry:usage-forwarding-failed', error, {
      action: payload.action,
    });
  }
}

function sanitizeOptionalTelemetryMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, TelemetryPrimitive> | undefined {
  return metadata ? sanitizeTelemetryMetadata(metadata) : undefined;
}

function sanitizeTelemetryMetadata(value: unknown): Record<string, TelemetryPrimitive> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const metadata = value as Record<string, unknown>;
  const sanitized: Record<string, TelemetryPrimitive> = {};
  const keys = Object.keys(metadata).slice(0, MAX_TELEMETRY_METADATA_ENTRIES);

  for (const key of keys) {
    if (
      key.length > MAX_TELEMETRY_KEY_LENGTH ||
      TELEMETRY_SENSITIVE_KEY.test(key) ||
      TELEMETRY_CONTENT_KEY.test(key)
    ) {
      continue;
    }

    const property = metadata[key];
    if (typeof property === 'string') {
      if (property.length > MAX_TELEMETRY_STRING_LENGTH) continue;
      if (EMAIL_VALUE.test(property)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      sanitized[key] = TELEMETRY_URL_KEY.test(key) ? stripQueryParams(property) : property;
      continue;
    }

    if (typeof property === 'number' || typeof property === 'boolean') {
      sanitized[key] = property;
    }
  }

  return sanitized;
}

function stripQueryParams(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split('?')[0];
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
    case 'analytics':
      return isAnalyticsPayload(payload);
    default:
      return false;
  }
}

function isAnalyticsPayload(value: unknown): value is AnalyticsPayload {
  if (!value || typeof value !== 'object') return false;

  const payload = value as Partial<Record<keyof AnalyticsPayload, unknown>>;
  if (
    typeof payload.name !== 'string' ||
    payload.name.length === 0 ||
    payload.name.length > 120 ||
    getAnalyticsPropertyAllowlist(payload.name) === null ||
    typeof payload.timestamp !== 'number' ||
    !payload.properties ||
    typeof payload.properties !== 'object' ||
    Array.isArray(payload.properties)
  ) {
    return false;
  }

  const entries = Object.entries(payload.properties);
  return entries.length <= 30 && entries.every(([key, property]) => {
    if (key.length > 80 || !['string', 'number', 'boolean'].includes(typeof property)) {
      return false;
    }
    return typeof property !== 'string' || property.length <= 2_000;
  });
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof ErrorPayload, unknown>>;
  const hasLocation =
    typeof payload.location === 'object' &&
    payload.location !== null &&
    isBoundedString((payload.location as { origin?: unknown }).origin) &&
    isBoundedString((payload.location as { pathname?: unknown }).pathname);
  const hasValidOptionalLocation = payload.location === undefined || hasLocation;
  const hasValidOptionalMetadata =
    payload.metadata === undefined ||
    (typeof payload.metadata === 'object' &&
      payload.metadata !== null &&
      !Array.isArray(payload.metadata));

  return (
    isBoundedString(payload.name, MAX_ERROR_IDENTIFIER_LENGTH) &&
    isBoundedString(payload.message) &&
    isOptionalBoundedString(payload.stack) &&
    isOptionalBoundedString(payload.componentStack) &&
    isOptionalBoundedString(payload.url) &&
    isOptionalBoundedString(payload.boundary, MAX_ERROR_IDENTIFIER_LENGTH) &&
    isOptionalBoundedString(payload.digest, MAX_ERROR_IDENTIFIER_LENGTH) &&
    (payload.hasStack === undefined || typeof payload.hasStack === 'boolean') &&
    (payload.hasComponentStack === undefined ||
      typeof payload.hasComponentStack === 'boolean') &&
    hasValidOptionalLocation &&
    hasValidOptionalMetadata &&
    (typeof payload.url === 'string' || hasLocation) &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp)
  );
}

function isBoundedString(
  value: unknown,
  maxLength: number = MAX_TELEMETRY_STRING_LENGTH
): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalBoundedString(
  value: unknown,
  maxLength: number = MAX_TELEMETRY_STRING_LENGTH
): boolean {
  return value === undefined || isBoundedString(value, maxLength);
}

function isPerformancePayload(value: unknown): value is PerformancePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof PerformancePayload, unknown>>;
  const hasValidOptionalTags =
    payload.tags === undefined ||
    (typeof payload.tags === 'object' &&
      payload.tags !== null &&
      !Array.isArray(payload.tags));

  return (
    isPerformanceMetricName(payload.metric) &&
    typeof payload.value === 'number' &&
    Number.isFinite(payload.value) &&
    isPerformanceMetricUnit(payload.unit) &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp) &&
    hasValidOptionalTags
  );
}

function isUsagePayload(value: unknown): value is UsagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof UsagePayload, unknown>>;

  return (
    sanitizeErrorIdentifier(
      typeof payload.action === 'string' ? payload.action : undefined
    ) !== undefined &&
    typeof payload.count === 'number' &&
    Number.isFinite(payload.count) &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp)
  );
}

export const POST = withObservability(postHandler, { operation: 'telemetry:ingest' });
