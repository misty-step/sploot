import type {
  AnalyticsTelemetryPayload,
  ErrorTelemetryPayload,
  PerformanceTelemetryPayload,
  TelemetryRequest,
  UsageTelemetryPayload,
} from '@/lib/telemetry-contract';

type WithoutTimestamp<T extends { timestamp: number }> = Omit<T, 'timestamp'>;

export async function postTelemetry(request: TelemetryRequest): Promise<void> {
  const response = await fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Telemetry request rejected (${response.status})`);
  }
}

export function postPerformanceMetric(
  payload: WithoutTimestamp<PerformanceTelemetryPayload>
): Promise<void> {
  return postTelemetry({
    type: 'performance',
    payload: { ...payload, timestamp: Date.now() },
  });
}

export function postUsageMetric(
  payload: WithoutTimestamp<UsageTelemetryPayload>
): Promise<void> {
  return postTelemetry({
    type: 'usage',
    payload: { ...payload, timestamp: Date.now() },
  });
}

export function postBlobLoadFailure(fallbackAttempted: boolean): Promise<void> {
  return postUsageMetric({
    action: 'blob_load_failure',
    count: 1,
    metadata: { fallbackAttempted },
  });
}

export function postAnalyticsEvent(
  payload: WithoutTimestamp<AnalyticsTelemetryPayload>
): Promise<void> {
  return postTelemetry({
    type: 'analytics',
    payload: { ...payload, timestamp: Date.now() },
  });
}

export function postClientError(
  payload: WithoutTimestamp<ErrorTelemetryPayload>
): Promise<void> {
  return postTelemetry({
    type: 'error',
    payload: { ...payload, timestamp: Date.now() },
  });
}
