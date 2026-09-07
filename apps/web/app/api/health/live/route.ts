import { NextResponse } from 'next/server';

/**
 * Process-liveness probe dedicated to platform routing (DigitalOcean App
 * Platform `services[name=web].health_check.http_path`).
 *
 * Ownership boundary (incident 2026-07-15): the deep readiness oracle,
 * /api/health, depends on the database and 503s fail-closed when Postgres is
 * degraded. Routing the only web instance on that oracle turned a DB/provider
 * workload into `no_healthy_upstream` for the whole origin. This route proves
 * exactly one thing — the intended Next process/deployment artifact is
 * responding — so platform routing never amplifies a dependency failure into
 * a full outage. Deep readiness stays on /api/health.
 *
 * Invariants, enforced by __tests__/api/health-live.test.ts:
 * - no database, provider, Clerk, telemetry, network, or model dependency;
 * - no awaited work: a hung pool or event-loop-heavy request cannot delay it
 *   beyond scheduling;
 * - no sensitive output (no env values, no configuration echo).
 */
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
} as const;

export function GET() {
  return NextResponse.json(
    { status: 'alive', service: 'sploot-web' },
    { status: 200, headers: HEADERS }
  );
}

export function HEAD() {
  return new NextResponse(null, { status: 200, headers: HEADERS });
}
