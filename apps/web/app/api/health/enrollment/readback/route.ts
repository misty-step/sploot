import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import {
  enrollmentUnavailableResponse,
  getEnrollmentReadback,
} from '@/lib/enrollment/enrollment-policy';

const getHandler = withAuthenticatedApi(async (_req: NextRequest, _context, { principal }) => {
  if (!prisma) return enrollmentUnavailableResponse();

  const operator = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { role: true },
  });
  if (!operator || !['admin', 'operator'].includes(operator.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(getEnrollmentReadback(await prisma.user.count()), {
    headers: { 'Cache-Control': 'no-store, private' },
  });
});

export const GET = withObservability(getHandler, { operation: 'health:enrollment-readback' });
