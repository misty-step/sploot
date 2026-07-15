import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  readPublicEnrollmentState,
} from '@/lib/enrollment/enrollment-policy';

export async function GET() {
  const read = await readPublicEnrollmentState({ prisma });
  return NextResponse.json(read.state, {
    status: read.available ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
