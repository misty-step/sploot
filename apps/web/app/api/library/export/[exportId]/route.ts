import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  withAuthenticatedApi,
  type AuthenticatedApiContext,
} from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import {
  cancelExport,
  getOwnedExport,
  toExportView,
} from '@/lib/export/export-service';
import type { RouteContext } from '@/lib/with-observability';
import { withObservability } from '@/lib/with-observability';
import logger from '@/lib/logger';

/**
 * Export session status (server-verified progress) and cancellation.
 * Tenant-scoped: an export id is only ever resolvable by its owner.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getHandler(
  _req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const { exportId } = await context.params;
    const row = await getOwnedExport(principal.userId, exportId ?? '');
    if (!row) {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 });
    }
    return NextResponse.json({ export: toExportView(row) });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('library-export:status-failed', error);
    return NextResponse.json({ error: 'Failed to load export' }, { status: 500 });
  }
}

async function deleteHandler(
  _req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const { exportId } = await context.params;
    const row = await getOwnedExport(principal.userId, exportId ?? '');
    if (!row) {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 });
    }
    const canceled = await cancelExport(principal.userId, row.id);
    return NextResponse.json({ canceled });
  } catch (error) {
    unstable_rethrow(error);
    logger.error('library-export:cancel-failed', error);
    return NextResponse.json({ error: 'Failed to cancel export' }, { status: 500 });
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), {
  operation: 'library-export:status',
});
export const DELETE = withObservability(withAuthenticatedApi(deleteHandler), {
  operation: 'library-export:cancel',
});
