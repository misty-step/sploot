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


// Dynamic event names are still finite: these are the only flow events emitted
// by the product and the only operation names passed to PerformanceMonitor.
// Keep this list synchronized with route instrumentation and PERF_OPERATIONS;
// database timings are checked against the finite Prisma model/action sets below.
const FLOW_EVENT_NAMES = new Set(['flow:upload_wizard:selected']);
const TIMING_OPERATION_NAMES = new Set([
  'analytics:usage', 'assets:audit', 'assets:batch-embedding-status', 'assets:create',
  'assets:delete', 'assets:detail', 'assets:embedding-status', 'assets:generate-embedding',
  'assets:list', 'assets:share', 'assets:similar', 'assets:tags:add', 'assets:tags:list',
  'assets:tags:remove', 'assets:update', 'cache:stats:get', 'cache:stats:manage',
  'cron:audit-assets', 'cron:process-embeddings', 'cron:purge-deleted-assets',
  'cron:purge-search-logs', 'cron:regenerate-thumbnails', 'db:ping', 'embeddings:image',
  'embeddings:text', 'health:check', 'health:check-head', 'health:services',
  'health:services-options', 'health:user-sync', 'internal.stripe.cancellation-drain',
  'library:starter-seed', 'piles:list', 'search:advanced', 'search:query',
  'search:suggestions', 'share-target', 'share-target:get', 'sse:embedding-updates',
  'stats:get', 'tags:create', 'tags:delete', 'tags:list', 'tags:update', 'taste:profile',
  'telemetry:ingest', 'upload-tokens:list', 'upload-tokens:mint', 'upload-tokens:revoke',
  'upload:check', 'upload:check-options', 'upload:direct', 'upload:status', 'upload:url',
  'version', 'webhooks.stripe',
  'upload:single', 'upload:batch', 'upload:blob_storage', 'upload:database_write',
  'upload:total', 'embedding:generate', 'embedding:queue_wait', 'embedding:replicate_api',
  'embedding:db_write', 'embedding:total', 'search:text_embedding', 'search:vector_query',
  'search:total', 'client:file_select', 'client:upload_start', 'client:to_searchable',
  'client:page_load', 'client:image_grid_render', 'db:query', 'db:write', 'db:transaction',
]);
const DATABASE_MODEL_NAMES = new Set([
  'User', 'UploadToken', 'UserIdentity', 'UserStorageQuota', 'StorageQuotaReservation',
  'Asset', 'AssetEmbedding', 'EmbeddingProviderCircuit', 'Tag', 'AssetTag', 'SearchLog',
  'TextEmbeddingCache', 'EmbeddingRateBucket', 'EmbeddingRateLease', 'StripeCancellationEvent',
  'StripeCancellationAlert', 'StripeCancellationAudit', 'StripeCancellationDelivery',
  'StripeCancellationMaintenance', 'StripeCancellationMaintenanceToken', 'raw',
]);
const DATABASE_OPERATION_NAMES = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'create',
  'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn',
  'upsert', 'delete', 'deleteMany', 'aggregate', 'count', 'groupBy', 'queryRaw',
  'queryRawUnsafe', 'executeRaw', 'executeRawUnsafe',
]);
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
  if (FLOW_EVENT_NAMES.has(name)) return FLOW_PROPERTY_ALLOWLIST;
  if (isAllowedTimingEventName(name)) return TIMING_PROPERTY_ALLOWLIST;
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

function isAllowedTimingEventName(name: string): boolean {
  const prefix = 'timing:';
  if (!name.startsWith(prefix)) return false;
  const operation = name.slice(prefix.length);
  if (TIMING_OPERATION_NAMES.has(operation)) return true;

  const parts = operation.split(':');
  return parts.length === 3 &&
    parts[0] === 'db' &&
    DATABASE_MODEL_NAMES.has(parts[1]) &&
    DATABASE_OPERATION_NAMES.has(parts[2]);
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

