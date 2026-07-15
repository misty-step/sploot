import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getEnrollmentReadback,
  getPublicEnrollmentState,
  enrollmentUnavailableResponse,
} from '@/lib/enrollment/enrollment-policy';

export async function GET() {
  try {
    if (!prisma) return enrollmentUnavailableResponse();
    const readback = getEnrollmentReadback(await prisma.user.count());
    return NextResponse.json({
      ...readback,
      publicState: getPublicEnrollmentState(process.env, readback.acceptingNewAccounts),
    }, { status: readback.configuration === 'valid' ? 200 : 503 });
  } catch {
    return enrollmentUnavailableResponse();
  }
}
