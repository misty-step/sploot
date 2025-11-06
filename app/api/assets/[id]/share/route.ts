import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { getOrCreateShareSlug, AssetNotFoundError } from '@/lib/share';
import { apiError } from '@/lib/api-error';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';

/**
 * Generate a share link for an asset
 *
 * POST /api/assets/[id]/share
 *
 * Authorization: Required - only asset owner can generate share link
 * Returns: { shareUrl: string } - The public share URL
 *
 * Error responses:
 * - 401: Unauthorized (not logged in)
 * - 404: Asset not found or not owned by user
 * - 404: Asset is soft-deleted (not shareable)
 * - 500: Internal server error
 */
async function postHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    // 1. Extract and verify auth
    const { userId } = await getAuth();
    if (!userId) {
      return apiError('UNAUTHORIZED', 'You must be logged in to share assets');
    }

    // 2. Extract asset ID from params
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return apiError('NOT_FOUND', 'Asset not found');
    }

    // 3. Verify database is configured
    if (!prisma) {
      return apiError('INTERNAL_ERROR', 'Database not configured');
    }

    // 4. Check asset ownership and existence
    // Must check: ownerUserId (authorization) AND deletedAt (soft-delete filter)
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!asset) {
      return apiError('NOT_FOUND', 'Asset not found');
    }

    // 5. Get or create share slug (idempotent)
    const slug = await getOrCreateShareSlug(id);

    // 6. Build share URL
    // Use NEXT_PUBLIC_BASE_URL from env, fallback to request origin
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
    const shareUrl = `${baseUrl}/s/${slug}`;

    // 7. Return share URL
    return NextResponse.json({ shareUrl });
  } catch (error) {
    // Rethrow Next.js internal errors
    unstable_rethrow(error);

    // Handle known errors
    if (error instanceof AssetNotFoundError) {
      // This shouldn't happen since we check existence above,
      // but handle it gracefully if it does
      return apiError('NOT_FOUND', 'Asset not found');
    }

    // Log unexpected errors
    console.error('[Share API] Unexpected error:', error);

    // Return generic error to client
    return apiError('INTERNAL_ERROR', 'Failed to generate share link');
  }
}

export const POST = withObservability(postHandler, { operation: 'assets:share' });
