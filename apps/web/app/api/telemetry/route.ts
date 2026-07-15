import { NextRequest, NextResponse } from 'next/server';

import { getAnalyticsPropertyAllowlist } from '@/lib/analytics';
import { logger } from '@/lib/observability-logger';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import {
  isPerformanceMetricName,
  isPerformanceMetricUnit,
  getPerformanceTagAllowlist,
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

const TELEMETRY_SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|session|email|user(?:_|-)?id|account(?:_|-)?id|clerk)/i;
const TELEMETRY_CONTENT_KEY = /^(query|search(?:Query|Term|Text)|search[_-](?:query|term|text))$/i;
const MAX_TELEMETRY_METADATA_ENTRIES = 30;
const MAX_TELEMETRY_KEY_LENGTH = 80;
const MAX_TELEMETRY_STRING_LENGTH = 2_000;
const MAX_ERROR_IDENTIFIER_LENGTH = 120;
const SAFE_ERROR_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const UPLOAD_FAILURE_REASONS = new Set(['unknown', 'network', 'offline', 'validation', 'duplicate']);

async function postHandler(request: NextRequest, _context: unknown, _auth: AuthenticatedApiContext): Promise<NextResponse> {
  try {
    const body = await safeJson(request);
    if (!body) {
      return respond({ success: false, message: 'invalid json' }, 400);
    }

    if (!isTelemetryRequest(body)) {
      return respond({ success: false, message: 'invalid payload' }, 400);
    }

    await forwardTelemetry(body);

    return respond({ success: true }, 200);
  } catch (error) {
    logger.logError('telemetry:unhandled', error);
    return respond({ success: true }, 200);
  }
}

async function forwardTelemetry(request: TelemetryRequest): Promise<void> {
  switch (request.type) {
    case 'error':
      forwardErrorTelemetry(request.payload);
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

function forwardErrorTelemetry(payload: ErrorPayload): void {
  try {
    // Browser error text and stacks are untrusted free text. Preserve only
    // bounded structural signal; never forward their raw contents to logs.
    const error = new Error('Client-reported error');
    error.name = sanitizeErrorIdentifier(payload.name) ?? 'ClientError';

    logger.logError('client:error', error, {
      name: error.name,
      boundary: sanitizeErrorIdentifier(payload.boundary),
      timestamp: payload.timestamp,
      hasStack: payload.hasStack,
      hasComponentStack: payload.hasComponentStack,
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

function forwardPerformanceTelemetry(payload: PerformancePayload): void {
  try {
    logger.logInfo('performance_metric', {
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit,
      timestamp: payload.timestamp,
      tags: sanitizePerformanceTags(payload.metric, payload.tags),
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
  metadata: unknown
): Record<string, string | number | boolean> | undefined {
  return metadata ? sanitizeTelemetryMetadata(metadata) : undefined;
}

function sanitizeTelemetryMetadata(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const metadata = value as Record<string, unknown>;
  const sanitized: Record<string, string | number | boolean> = {};
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
      if (/\S+@\S+\.\S+/.test(property)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      sanitized[key] = property;
      continue;
    }

    if (typeof property === 'number' || typeof property === 'boolean') {
      sanitized[key] = property;
    }
  }

  return sanitized;
}

function sanitizePerformanceTags(
  metric: PerformancePayload['metric'],
  tags: PerformancePayload['tags']
): PerformancePayload['tags'] | undefined {
  if (!tags) return undefined;
  const allowlist = getPerformanceTagAllowlist(metric);
  const sanitized = sanitizeTelemetryMetadata(
    Object.fromEntries(allowlist.map((key) => [key, tags[key]]))
  );
  return sanitized as PerformancePayload['tags'];
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
  const allowlist =
    typeof payload.name === 'string' ? getAnalyticsPropertyAllowlist(payload.name) : null;
  if (
    typeof payload.name !== 'string' ||
    payload.name.length === 0 ||
    payload.name.length > 120 ||
    allowlist === null ||
    typeof payload.timestamp !== 'number' ||
    !payload.properties ||
    typeof payload.properties !== 'object' ||
    Array.isArray(payload.properties)
  ) {
    return false;
  }

  const entries = Object.entries(payload.properties);
  if (!allowlist) return false;
  const requiredByEvent: Record<string, readonly string[]> = {
    upload_file_selected: ['count', 'totalSize'],
    upload_started: ['size'],
    upload_completed: ['duration', 'size'],
    upload_failed: ['reason', 'size'],
    search_query_submitted: ['queryLength', 'hasFilters'],
    search_results_shown: ['count', 'latency', 'hasFilters'],
    search_result_clicked: ['position', 'score'],
    search_no_results: ['queryLength', 'hasFilters'],
    asset_favorited: [],
    asset_unfavorited: [],
    asset_deleted: ['hadTags'],
    tag_added: [],
    tag_removed: [],
  };
  const requiredProperties = requiredByEvent[payload.name] ??
    (/^(?:flow|timing):/.test(payload.name) ? [] : null);
  return entries.length <= 30 &&
    requiredProperties !== null &&
    requiredProperties.every((key) => Object.prototype.hasOwnProperty.call(payload.properties, key)) &&
    entries.every(([key, property]) => {
    if (
      !allowlist.includes(key) ||
      key.length > 80 ||
      !['string', 'number', 'boolean'].includes(typeof property)
    ) {
      return false;
    }
    if (typeof property === 'string' && property.length > 2_000) return false;
    return payload.name !== 'upload_failed' || key !== 'reason' || UPLOAD_FAILURE_REASONS.has(property as string);
  });
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof ErrorPayload, unknown>>;

  return (
    isBoundedString(payload.name, MAX_ERROR_IDENTIFIER_LENGTH) &&
    isBoundedString(payload.boundary, MAX_ERROR_IDENTIFIER_LENGTH) &&
    typeof payload.hasStack === 'boolean' &&
    typeof payload.hasComponentStack === 'boolean' &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp) &&
    hasOnlyKeys(payload, ['name', 'boundary', 'hasStack', 'hasComponentStack', 'timestamp'])
  );
}

function isBoundedString(
  value: unknown,
  maxLength: number = MAX_TELEMETRY_STRING_LENGTH
): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
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
      !Array.isArray(payload.tags) &&
      isPerformanceMetricName(payload.metric) &&
      Object.keys(payload.tags).every((key) =>
        getPerformanceTagAllowlist(payload.metric as PerformancePayload['metric']).includes(key as never)
      ));

  return (
    isPerformanceMetricName(payload.metric) &&
    typeof payload.value === 'number' &&
    Number.isFinite(payload.value) &&
    isPerformanceMetricUnit(payload.unit) &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp) &&
    hasValidOptionalTags &&
    hasOnlyKeys(payload, ['metric', 'value', 'unit', 'timestamp', 'tags'])
  );
}

function isUsagePayload(value: unknown): value is UsagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<Record<keyof UsagePayload, unknown>>;

  return (
    payload.action === 'blob_load_failure' &&
    typeof payload.count === 'number' &&
    Number.isFinite(payload.count) &&
    typeof payload.timestamp === 'number' &&
    Number.isFinite(payload.timestamp) &&
    (payload.metadata === undefined ||
      (typeof payload.metadata === 'object' &&
        payload.metadata !== null &&
        !Array.isArray(payload.metadata) &&
        typeof (payload.metadata as { fallbackAttempted?: unknown }).fallbackAttempted === 'boolean')) &&
    hasOnlyKeys(payload, ['action', 'count', 'timestamp', 'metadata'])
  );
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'telemetry:ingest' });
