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
  reachable: boolean | null;
  status: 'healthy' | 'degraded' | 'not_configured';
  message: string;
}

const REDACTED = '[redacted]';
const DEFAULT_SERVICE = 'sploot-web';
const DEFAULT_TIMEOUT_MS = 2500;
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 40;
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|session|api[-_]?key|dsn|credential)/i;

export function canaryConfigured(): boolean {
  return getCanaryConfig() !== null;
}

export async function reportCanaryError(input: CanaryReportInput): Promise<void> {
  const config = getCanaryConfig();
  if (!config) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    await fetch(`${config.endpoint}/api/v1/errors`, {
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
          vercel_region: process.env.VERCEL_REGION,
          vercel_url: process.env.VERCEL_URL,
          metadata: sanitizeValue(input.metadata),
        },
      }),
      signal: controller.signal,
    });
  } catch {
    // Canary must never affect the user flow or primary logging path.
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkCanaryStatus(): Promise<CanaryStatus> {
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
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.endpoint}/api/v1/openapi.json`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        configured: true,
        reachable: true,
        status: 'healthy',
        message: 'Canary OpenAPI contract reachable',
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
          vercel_region: process.env.VERCEL_REGION,
          vercel_url: process.env.VERCEL_URL,
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
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
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
