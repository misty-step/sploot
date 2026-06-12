import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { revokePersonalUploadToken } from '@/lib/auth/personal-upload-token';
import { withObservability, type RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/vercel-logger';

async function deleteHandler(
  _req: NextRequest,
  context: RouteContext,
  { principal }: { principal: { userId: string } }
) {
  try {
    const { id } = await context.params;
    const revoked = await revokePersonalUploadToken(principal.userId, id);
    if (!revoked) {
      return NextResponse.json({ error: 'Upload token not found' }, { status: 404 });
    }

    return NextResponse.json({ revoked: true });
  } catch (error) {
    logError('upload-tokens:revoke-failed', error);
    return NextResponse.json({ error: 'Failed to revoke upload token' }, { status: 500 });
  }
}

export const DELETE = withObservability(withAuthenticatedApi(deleteHandler), { operation: 'upload-tokens:revoke' });
