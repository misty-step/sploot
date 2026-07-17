import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import {
  createOrReuseExport,
  ExportEgressWindowExhaustedError,
  getActiveExport,
} from '@/lib/export/export-service';
import { withObservability } from '@/lib/with-observability';
import logger from '@/lib/logger';

/**
 * Complete-library export sessions (Powder card sploot-057).
 *
 * POST creates (or reuses) the caller's active export session, or replays a
 * durable completed manifest. GET returns the active session or completed
 * manifest so an interrupted or finished export can be rediscovered.
 *
 * Deliberately gate-free beyond enrollment: no storage-quota, billing, or
 * runtime-gate checks may ever be added here. Per VISION.md, crossing a
 * limit, delinquency, or cancellation never removes export access.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function postHandler(
  req: NextRequest,
  _context: unknown,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();

    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch {
      // No body — default create semantics.
    }

    const { export: view, reused } = await createOrReuseExport(principal.userId, { force });
    return NextResponse.json({ export: view, reused }, { status: reused ? 200 : 201 });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ExportEgressWindowExhaustedError) {
      return NextResponse.json(
        {
          error: 'Export session limit reached for the rolling egress window',
          code: error.code,
          retryable: true,
          retryAfterSec: error.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
        },
      );
    }
    logger.error('library-export:create-failed', error);
    return NextResponse.json({ error: 'Failed to create export' }, { status: 500 });
  }
}

async function getHandler(
  _req: NextRequest,
  _context: unknown,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const view = await getActiveExport(principal.userId);
    return NextResponse.json({ export: view });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('library-export:current-failed', error);
    return NextResponse.json({ error: 'Failed to load export' }, { status: 500 });
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), {
  operation: 'library-export:create',
});
export const GET = withObservability(withAuthenticatedApi(getHandler), {
  operation: 'library-export:current',
});
