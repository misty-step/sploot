/**
 * Type-safe, provider-neutral event tracking with PII sanitization.
 *
 * Browser events use the authenticated first-party telemetry route. Server
 * events write to the structured observability logger. Telemetry remains
 * best-effort and never blocks product behavior.
 */

import { postAnalyticsEvent } from '@/lib/telemetry-client';

export type AnalyticsEvent =
  | { name: 'upload_file_selected'; properties: { count: number; totalSize: number } }
  | { name: 'upload_started'; properties: { size: number } }
  | { name: 'upload_completed'; properties: { duration: number; size: number } }
  | { name: 'upload_failed'; properties: { reason: 'unknown' | 'network' | 'offline' | 'validation' | 'duplicate'; size: number } }
  | { name: 'search_query_submitted'; properties: { queryLength: number; hasFilters: boolean } }
  | { name: 'search_results_shown'; properties: { count: number; latency: number; hasFilters: boolean } }
  | { name: 'search_result_clicked'; properties: { position: number; score: number } }
  | { name: 'search_no_results'; properties: { queryLength: number; hasFilters: boolean } }
  | { name: 'asset_favorited'; properties: Record<string, never> }
  | { name: 'asset_unfavorited'; properties: Record<string, never> }
  | { name: 'asset_deleted'; properties: { hadTags: boolean } }
  | { name: 'tag_added'; properties: Record<string, never> }
  | { name: 'tag_removed'; properties: Record<string, never> };

type DeclaredAnalyticsEventName = AnalyticsEvent['name'];
type AnalyticsPropertiesFor<Name extends DeclaredAnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: Name }
>['properties'];
type AnalyticsPropertyAllowlist = {
  [Name in DeclaredAnalyticsEventName]: readonly Extract<
    keyof AnalyticsPropertiesFor<Name>,
    string
  >[];
};

type SanitizedProperties = Record<string, string | number | boolean>;

interface TelemetryEvent {
  name: string;
  properties: SanitizedProperties;
}

const ANALYTICS_EVENT_PROPERTY_ALLOWLIST = {
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
} as const satisfies AnalyticsPropertyAllowlist;

// Every allowlisted analytics property is a number, boolean, or bounded enum.
// Free-form strings are not part of the analytics contract: this spec is the
// single source the client sanitizer and the /api/telemetry validator share.
export type AnalyticsPropertyType = 'number' | 'boolean' | readonly string[];

const ANALYTICS_PROPERTY_TYPES = {
  count: 'number',
  totalSize: 'number',
  size: 'number',
  duration: 'number',
  latency: 'number',
  queryLength: 'number',
  position: 'number',
  score: 'number',
  hasFilters: 'boolean',
  hadTags: 'boolean',
  success: 'boolean',
  reason: ['unknown', 'network', 'offline', 'validation', 'duplicate'],
} as const satisfies Record<string, AnalyticsPropertyType>;


const FLOW_EVENT_NAME = /^flow:[a-z][a-z0-9_-]{0,39}:[a-z][a-z0-9_-]{0,39}$/;
const TIMING_EVENT_NAME = /^timing:[a-z][a-z0-9:_-]{0,99}$/i;
const FLOW_PROPERTY_ALLOWLIST = ['count', 'totalSize', 'size', 'hasFilters'] as const;
const TIMING_PROPERTY_ALLOWLIST = ['duration', 'success', 'size', 'count'] as const;
const UPLOAD_FAILURE_REASONS = new Set(['unknown', 'network', 'offline', 'validation', 'duplicate']);

export function getAnalyticsPropertySpec(
  name: string
): Record<string, AnalyticsPropertyType> | null {
  const allowlist = getAnalyticsPropertyAllowlist(name);
  if (!allowlist) return null;
  return Object.fromEntries(
    allowlist.map((key) => [key, ANALYTICS_PROPERTY_TYPES[key as keyof typeof ANALYTICS_PROPERTY_TYPES]])
  );
}

export function getAnalyticsPropertyAllowlist(name: string): readonly string[] | null {
  const declared = Object.prototype.hasOwnProperty.call(
    ANALYTICS_EVENT_PROPERTY_ALLOWLIST,
    name
  )
    ? ANALYTICS_EVENT_PROPERTY_ALLOWLIST[name as DeclaredAnalyticsEventName]
    : undefined;
  if (declared) return declared;
  if (FLOW_EVENT_NAME.test(name)) return FLOW_PROPERTY_ALLOWLIST;
  if (TIMING_EVENT_NAME.test(name)) return TIMING_PROPERTY_ALLOWLIST;
  return null;
}

export function track(event: AnalyticsEvent): void {
  emitAllowedEvent(event.name, event.properties);
}

export async function trackServer(event: AnalyticsEvent): Promise<void> {
  const telemetryEvent = prepareTelemetryEvent(event.name, event.properties);
  if (telemetryEvent) await logServerEvent(telemetryEvent);
}

export function trackFlow(
  flowName: string,
  step: string,
  metadata?: Record<string, unknown>
): void {
  emitAllowedEvent(`flow:${flowName}:${step}`, metadata ?? {});
}

export function trackTiming(
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, unknown>
): void {
  emitAllowedEvent(`timing:${operation}`, { duration, success, ...metadata });
}

function emitAllowedEvent(name: string, properties: Record<string, unknown>): void {
  const telemetryEvent = prepareTelemetryEvent(name, properties);
  if (telemetryEvent) emit(telemetryEvent);
}

function prepareTelemetryEvent(
  name: string,
  properties: Record<string, unknown>
): TelemetryEvent | null {
  const allowlist = getAnalyticsPropertyAllowlist(name);
  if (!allowlist) return null;

  return {
    name,
    properties: sanitizeEventProperties(name, properties, allowlist),
  };
}

function emit(event: TelemetryEvent): void {
  try {
    if (typeof window !== 'undefined') {
      if (navigator.doNotTrack === '1') return;

      void postAnalyticsEvent(event);
      return;
    }

    void logServerEvent(event);
  } catch {
    // Telemetry is strictly best effort and must never affect product UX.
  }
}

async function logServerEvent(event: TelemetryEvent): Promise<void> {
  try {
    const { logger } = await import('@/lib/observability-logger');
    logger.logInfo('analytics:event', event);
  } catch {
    // A missing or unavailable observability sink is an ordinary failure mode.
  }
}

function sanitizeEventProperties(
  name: string,
  properties: Record<string, unknown>,
  allowlist: readonly string[]
): SanitizedProperties {
  const sanitized: SanitizedProperties = {};

  for (const key of allowlist) {
    const value = properties[key];
    if (value === undefined) continue;

    if (name === 'upload_failed' && key === 'reason') {
      sanitized[key] = typeof value === 'string' && UPLOAD_FAILURE_REASONS.has(value)
        ? value
        : 'unknown';
      continue;
    }

    const expected = ANALYTICS_PROPERTY_TYPES[key as keyof typeof ANALYTICS_PROPERTY_TYPES];
    if (expected === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value;
      continue;
    }
    if (expected === 'boolean') {
      if (typeof value === 'boolean') sanitized[key] = value;
      continue;
    }
    if (typeof value === 'string' && (expected as readonly string[]).includes(value)) sanitized[key] = value;
  }

  return sanitized;
}

