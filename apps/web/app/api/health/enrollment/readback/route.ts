import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import {
  enrollmentUnavailableResponse,
  getEnrollmentReadback,
} from '@/lib/enrollment/enrollment-policy';

const getHandler = withAuthenticatedApi(async (_req: NextRequest, _context, { principal }) => {
  if (!prisma) return enrollmentUnavailableResponse();

  let operator: { role: string } | null;
  try {
    operator = await prisma.user.findUnique({
      where: { id: principal.userId },
      select: { role: true },
    });
  } catch {
    logger.logError(
      'health:enrollment-readback-unavailable',
      new Error('enrollment readback unavailable'),
      { reason: 'database_error' },
    );
    return enrollmentUnavailableResponse();
  }
  if (!operator || !['admin', 'operator'].includes(operator.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    return NextResponse.json(getEnrollmentReadback(await prisma.user.count()), {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch {
    logger.logError(
      'health:enrollment-readback-unavailable',
      new Error('enrollment readback unavailable'),
      { reason: 'database_error' },
    );
    return enrollmentUnavailableResponse();
  }
});

export const GET = withObservability(getHandler, { operation: 'health:enrollment-readback' });
