import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/upload-tokens/[id] - revoke a personal upload token.
 *
 * Session-authenticated (default policy; an upload token cannot revoke tokens).
 * Soft revoke (sets revoked_at). Ownership-checked and idempotent: the update is
 * scoped to the caller's own, not-already-revoked token, so revoking a token
 * that is missing, already revoked, or owned by someone else is a no-op that
 * still returns success and reveals nothing.
 */
const deleteHandler = withAuthenticatedApi(
  async (_req: NextRequest, context: RouteContext, { principal }) => {
    if (!prisma) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'token not found' }, { status: 404 });
    }

    await prisma.uploadToken.updateMany({
      where: { id, userId: principal.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  }
);

export const DELETE = withObservability(deleteHandler, { operation: 'upload-tokens:revoke' });
