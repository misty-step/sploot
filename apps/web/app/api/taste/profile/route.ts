import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { getTasteProfile } from '@/lib/taste/taste-engine';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

async function getHandler(
  _req: NextRequest,
  _context: unknown,
  { principal }: { principal: { userId: string } },
) {
  try {
    const profile = await getTasteProfile(principal.userId);
    return NextResponse.json(profile);
  } catch (error) {
    logError('taste:profile-failed', error);
    return NextResponse.json({ error: 'Failed to load taste profile' }, { status: 500 });
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'taste:profile' });
