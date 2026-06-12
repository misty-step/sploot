import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import {
  createPersonalUploadToken,
  listPersonalUploadTokens,
} from '@/lib/auth/personal-upload-token';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

async function getHandler(_req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  try {
    const tokens = await listPersonalUploadTokens(principal.userId);
    return NextResponse.json({ tokens });
  } catch (error) {
    logError('upload-tokens:list-failed', error);
    return NextResponse.json({ error: 'Failed to list upload tokens' }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : 'iOS Shortcut';
    const result = await createPersonalUploadToken(principal.userId, name);

    return NextResponse.json({
      token: result.token,
      record: result.record,
    }, { status: 201 });
  } catch (error) {
    logError('upload-tokens:create-failed', error);
    return NextResponse.json({ error: 'Failed to create upload token' }, { status: 500 });
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'upload-tokens:list' });
export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'upload-tokens:create' });
