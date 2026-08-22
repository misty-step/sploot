import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from '@/lib/with-observability';
import { unauthorizedResponse } from './api';

export type CronApiHandler<Context extends RouteContext = RouteContext> = (
  req: NextRequest,
  context: Context
) => Promise<Response | NextResponse>;

function cronBearerMatches(authHeader: string | null, cronSecret: string): boolean {
  if (typeof authHeader !== 'string') {
    return false;
  }

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Shared CRON_SECRET Bearer gate for scheduler routes.
 *
 * Missing secret is a server misconfiguration (500). Wrong or absent
 * Authorization is 401. Comparison is timing-safe so one route cannot leak
 * the secret by using `!==` while another uses `timingSafeEqual`.
 *
 * Database availability stays in each route: those 503 bodies are not the
 * same contract (`Database unavailable` vs `Database not configured`).
 */
async function authorizeCronRequest(): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = (await headers()).get('authorization');
  if (!cronBearerMatches(authHeader, cronSecret)) {
    return unauthorizedResponse();
  }

  return null;
}

export function withCronAuth<Context extends RouteContext = RouteContext>(
  handler: CronApiHandler<Context>
) {
  return async function cronHandler(
    req: NextRequest,
    context: Context
  ): Promise<Response | NextResponse> {
    const denied = await authorizeCronRequest();
    if (denied) return denied;
    return handler(req, context);
  };
}
