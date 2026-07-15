import type {
  AnalyticsTelemetryPayload,
  ErrorTelemetryPayload,
  PerformanceTelemetryPayload,
  TelemetryRequest,
  UsageTelemetryPayload,
} from '@/lib/telemetry-contract';
import { getPerformanceTagAllowlist } from '@/lib/telemetry-contract';

type WithoutTimestamp<T extends { timestamp: number }> = Omit<T, 'timestamp'>;

export interface TelemetrySink {
  endpoint: string;
  enabled: boolean;
  timeoutMs: number;
}

const DEFAULT_TELEMETRY_ENDPOINT = '/api/telemetry';
const DEFAULT_TELEMETRY_TIMEOUT_MS = 1_500;

export function resolveTelemetrySink(
  env: Record<string, string | undefined> = process.env
): TelemetrySink {
  const configuredEndpoint = env.NEXT_PUBLIC_TELEMETRY_ENDPOINT?.trim();
  const endpoint = isSafeTelemetryEndpoint(configuredEndpoint)
    ? configuredEndpoint
    : DEFAULT_TELEMETRY_ENDPOINT;

  return {
    endpoint,
    enabled: env.NEXT_PUBLIC_TELEMETRY_ENABLED !== 'false',
    timeoutMs: DEFAULT_TELEMETRY_TIMEOUT_MS,
  };
}

export const telemetrySink = resolveTelemetrySink();

export async function postTelemetry(
  request: TelemetryRequest,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  if (!sink.enabled) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sink.timeoutMs);

  try {
    const response = await fetch(sink.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      signal: controller.signal,
      body: JSON.stringify(request),
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function isSafeTelemetryEndpoint(value: string | undefined): value is string {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//'));
}

function sanitizePerformanceTags(
  metric: PerformanceTelemetryPayload['metric'],
  tags: PerformanceTelemetryPayload['tags']
): PerformanceTelemetryPayload['tags'] | undefined {
  if (!tags) return undefined;

  const allowlist = getPerformanceTagAllowlist(metric);
  return Object.fromEntries(
    allowlist
      .filter((key) => Object.prototype.hasOwnProperty.call(tags, key))
      .map((key) => [key, tags[key]])
  ) as PerformanceTelemetryPayload['tags'];
}

export function postPerformanceMetric(
  payload: WithoutTimestamp<PerformanceTelemetryPayload>,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  return postTelemetry({
    type: 'performance',
    payload: {
      ...payload,
      tags: sanitizePerformanceTags(payload.metric, payload.tags),
      timestamp: Date.now(),
    },
  }, sink);
}

export function postUsageMetric(
  payload: WithoutTimestamp<UsageTelemetryPayload>,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  return postTelemetry({
    type: 'usage',
    payload: { ...payload, timestamp: Date.now() },
  }, sink);
}

export function postBlobLoadFailure(
  fallbackAttempted: boolean,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  return postUsageMetric({
    action: 'blob_load_failure',
    count: 1,
    metadata: { fallbackAttempted },
  }, sink);
}

export function postAnalyticsEvent(
  payload: WithoutTimestamp<AnalyticsTelemetryPayload>,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  return postTelemetry({
    type: 'analytics',
    payload: { ...payload, timestamp: Date.now() },
  }, sink);
}

export function postClientError(
  payload: WithoutTimestamp<ErrorTelemetryPayload>,
  sink: TelemetrySink = telemetrySink
): Promise<boolean> {
  return postTelemetry({
    type: 'error',
    payload: { ...payload, timestamp: Date.now() },
  }, sink);
}
