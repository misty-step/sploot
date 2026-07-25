type Severity = 'info' | 'warning' | 'error' | 'critical';

interface CanaryConfig {
  endpoint: string;
  apiKey: string;
  service: string;
  environment: string;
}

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

interface CanaryReportInput {
  context: string;
  error: SerializedError;
  traceId?: string;
  metadata?: Record<string, any>;
  severity?: Severity;
}

interface CanaryCheckInInput {
  status?: 'alive' | 'in_progress' | 'ok' | 'error';
  summary: string;
  ttlMs?: number;
  context?: Record<string, any>;
}

interface CanaryStatus {
  configured: boolean;
  /** Network/OpenAPI reachability only — not authenticated ingest proof. */
  reachable: boolean | null;
  status: 'healthy' | 'degraded' | 'not_configured';
  message: string;
}

const REDACTED = '[redacted]';
const DEFAULT_SERVICE = 'sploot-web';
const DEFAULT_TIMEOUT_MS = 2500;
/** Health diagnostics must not wait the full Canary timeout. */
const HEALTH_PROBE_TIMEOUT_MS = 400;
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 40;
/** Identical fingerprints may POST at most this many times per window. */
export const CANARY_ERROR_THROTTLE_MAX = 3;
/** Sliding window for fingerprint throttle (ms). */
export const CANARY_ERROR_THROTTLE_WINDOW_MS = 60_000;
/** Hard cap on in-process throttle map size after eviction sweep. */
export const CANARY_ERROR_THROTTLE_MAX_KEYS = 256;
/** Cache reachability probes so deep health does not hammer a dead sink. */
const REACHABILITY_CACHE_TTL_MS = 30_000;
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|session|api[-_]?key|dsn|credential)/i;

type ThrottleBucket = {
  windowStartedAt: number;
  count: number;
};

const errorThrottleBuckets = new Map<string, ThrottleBucket>();

let reachabilityCache: {
  expiresAt: number;
  status: CanaryStatus;
} | null = null;

let reachabilityInFlight: Promise<CanaryStatus> | null = null;

export function canaryConfigured(): boolean {
  return getCanaryConfig() !== null;
}

/**
 * Test-only: clear in-process throttle + reachability caches.
 */
export function __resetCanaryReporterForTests(): void {
  errorThrottleBuckets.clear();
  reachabilityCache = null;
  reachabilityInFlight = null;
}

export function fingerprintCanaryError(input: {
  context: string;
  error: Pick<SerializedError, 'name' | 'message'>;
}): string {
  const name = input.error.name || 'Error';
  const message = input.error.message || input.context;
  return `${input.context}\0${name}\0${message}`;
}

function sweepExpiredThrottleBuckets(now: number): void {
  for (const [key, bucket] of errorThrottleBuckets) {
    if (now - bucket.windowStartedAt >= CANARY_ERROR_THROTTLE_WINDOW_MS) {
      errorThrottleBuckets.delete(key);
    }
  }
  while (errorThrottleBuckets.size > CANARY_ERROR_THROTTLE_MAX_KEYS) {
    const oldest = errorThrottleBuckets.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    errorThrottleBuckets.delete(oldest);
  }
}

/**
 * Reserve one throttle slot. Returns false when the fingerprint is over budget.
 * Caller must refund on failed delivery.
 */
export function reserveCanaryErrorReport(
  fingerprint: string,
  now = Date.now()
): boolean {
  sweepExpiredThrottleBuckets(now);
  const existing = errorThrottleBuckets.get(fingerprint);
  if (!existing || now - existing.windowStartedAt >= CANARY_ERROR_THROTTLE_WINDOW_MS) {
    errorThrottleBuckets.set(fingerprint, { windowStartedAt: now, count: 1 });
    return true;
  }
  if (existing.count >= CANARY_ERROR_THROTTLE_MAX) {
    return false;
  }
  existing.count += 1;
  return true;
}

export function refundCanaryErrorReport(fingerprint: string, now = Date.now()): void {
  const existing = errorThrottleBuckets.get(fingerprint);
  if (!existing) {
    return;
  }
  if (now - existing.windowStartedAt >= CANARY_ERROR_THROTTLE_WINDOW_MS) {
    errorThrottleBuckets.delete(fingerprint);
    return;
  }
  existing.count = Math.max(0, existing.count - 1);
  if (existing.count === 0) {
    errorThrottleBuckets.delete(fingerprint);
  }
}


export async function reportCanaryError(input: CanaryReportInput): Promise<boolean> {
  const config = getCanaryConfig();
  if (!config) {
    return false;
  }

  const fingerprint = fingerprintCanaryError({
    context: input.context,
    error: input.error,
  });
  if (!reserveCanaryErrorReport(fingerprint)) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.endpoint}/api/v1/errors`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service: config.service,
        error_class: input.error.name || 'Error',
        message: input.error.message || input.context,
        stack_trace: input.error.stack,
        severity: input.severity ?? 'error',
        context: {
          source: 'sploot-web',
          context: input.context,
          trace_id: input.traceId,
          environment: config.environment,
          metadata: sanitizeValue(input.metadata),
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Keep the throttle reservation when the sink rejects the payload.
      // Only transport failures refund (storm brake must hold on a dead sink).
      return false;
    }
    return true;
  } catch {
    refundCanaryErrorReport(fingerprint);
    // Canary must never affect the user flow or primary logging path.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCanaryStatus(options?: {
  bypassCache?: boolean;
  /** Shorter probe timeout for health diagnostics (default full timeout). */
  timeoutMs?: number;
}): Promise<CanaryStatus> {
  const now = Date.now();
  if (
    !options?.bypassCache &&
    reachabilityCache &&
    reachabilityCache.expiresAt > now
  ) {
    return reachabilityCache.status;
  }

  if (reachabilityInFlight && !options?.bypassCache) {
    return reachabilityInFlight;
  }

  const probe = probeCanaryStatus(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    .then((status) => {
      reachabilityCache = {
        expiresAt: Date.now() + REACHABILITY_CACHE_TTL_MS,
        status,
      };
      return status;
    })
    .finally(() => {
      if (reachabilityInFlight === probe) {
        reachabilityInFlight = null;
      }
    });

  if (!options?.bypassCache) {
    reachabilityInFlight = probe;
  }
  return probe;
}

/**
 * Last known reachability without starting a new probe (may be stale or null).
 */
export function peekCanaryReachability(): boolean | null {
  if (!canaryConfigured()) {
    return null;
  }
  return reachabilityCache?.status.reachable ?? null;
}

async function probeCanaryStatus(timeoutMs: number): Promise<CanaryStatus> {
  const config = getCanaryConfig();
  if (!config) {
    return {
      configured: false,
      reachable: null,
      status: 'not_configured',
      message: 'Missing CANARY_ENDPOINT or CANARY_API_KEY',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // OpenAPI is unauthenticated by design — surfaces network/DNS/host liveness
    // only. Authenticated ingest is proven separately after host restore.
    const response = await fetch(`${config.endpoint}/api/v1/openapi.json`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        configured: true,
        reachable: true,
        status: 'healthy',
        message: 'Canary OpenAPI contract reachable (ingest auth not verified)',
      };
    }

    return {
      configured: true,
      reachable: false,
      status: 'degraded',
      message: `Canary returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'Canary unreachable',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function reportCanaryCheckIn(input: CanaryCheckInInput): Promise<void> {
  const config = getCanaryConfig();
  if (!config) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    await fetch(`${config.endpoint}/api/v1/check-ins`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        monitor: config.service,
        status: input.status ?? 'alive',
        summary: input.summary,
        ttl_ms: input.ttlMs ?? 300_000,
        context: sanitizeValue({
          source: 'sploot-web',
          environment: config.environment,
          ...input.context,
        }),
      }),
      signal: controller.signal,
    });
  } catch {
    // Canary must never affect the user flow or primary health route.
  } finally {
    clearTimeout(timeout);
  }
}

function getCanaryConfig(): CanaryConfig | null {
  if (process.env.NODE_ENV === 'test' && process.env.CANARY_ENABLE_IN_TEST !== '1') {
    return null;
  }

  const endpoint = normalizeEndpoint(process.env.CANARY_ENDPOINT);
  const apiKey = process.env.CANARY_API_KEY || process.env.CANARY_INGEST_KEY;

  if (!endpoint || !apiKey) {
    return null;
  }

  return {
    endpoint,
    apiKey,
    service: process.env.CANARY_SERVICE_NAME || DEFAULT_SERVICE,
    environment: process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'unknown',
  };
}

function normalizeEndpoint(endpoint: string | undefined): string | null {
  if (!endpoint) {
    return null;
  }

  try {
    const url = new URL(endpoint);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[truncated]';
  }

  if (value === null || typeof value === 'undefined') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map(item => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, item]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeValue(item, depth + 1),
      ])
    );
  }

  return String(value);
}

export { HEALTH_PROBE_TIMEOUT_MS };
