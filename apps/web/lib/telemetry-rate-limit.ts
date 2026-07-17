/**
 * Fixed-window, per-user, in-process limiter for the telemetry ingest route.
 *
 * Telemetry needs abuse damping, not distributed budget accounting, so
 * per-instance windows are sufficient and keep the endpoint free of Postgres
 * round-trips. Fails closed: when the bounded window table is saturated by
 * distinct users, new users are rejected, never grown.
 */

export const TELEMETRY_RATE_LIMIT_WINDOW_MS = 60_000;
export const TELEMETRY_RATE_LIMIT_MAX_REQUESTS = 60;
const MAX_RATE_ENTRIES = 10_000;

const telemetryRateWindows = new Map<string, { windowStart: number; count: number }>();

export function consumeTelemetryRateLimit(userId: string, nowMs: number = Date.now()): boolean {
  const window = telemetryRateWindows.get(userId);
  if (window && nowMs - window.windowStart < TELEMETRY_RATE_LIMIT_WINDOW_MS) {
    if (window.count >= TELEMETRY_RATE_LIMIT_MAX_REQUESTS) return false;
    window.count += 1;
    return true;
  }

  if (!window && telemetryRateWindows.size >= MAX_RATE_ENTRIES) {
    for (const [key, existing] of telemetryRateWindows) {
      if (nowMs - existing.windowStart >= TELEMETRY_RATE_LIMIT_WINDOW_MS) {
        telemetryRateWindows.delete(key);
      }
    }
    if (telemetryRateWindows.size >= MAX_RATE_ENTRIES) return false;
  }

  telemetryRateWindows.set(userId, { windowStart: nowMs, count: 1 });
  return true;
}

export function __resetTelemetryRateLimitForTests(): void {
  telemetryRateWindows.clear();
}
