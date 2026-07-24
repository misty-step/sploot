import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateShareSlug, revokeShareSlug, AssetNotFoundError } from '@/lib/share';
import { invalidateSlugCache } from '@/lib/slug-cache';
import { apiError } from '@/lib/api-error';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';

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
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    // 1. Extract and verify auth
    const userId = principal.userId;

    // 2. Extract asset ID from params
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return apiError('NOT_FOUND', 'Asset not found');
    }

    // 3. Verify database is configured
    if (!prisma) {
      return enrollmentUnavailableResponse();
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
    const slug = await getOrCreateShareSlug(id, userId);

    // 6. Build share URL
    // Use NEXT_PUBLIC_BASE_URL from env, fallback to request origin
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
    const shareUrl = `${baseUrl}/s/${slug}`;

    // 7. Return share URL
    return NextResponse.json({ shareUrl });
  } catch (error) {
    // Rethrow Next.js internal errors
    unstable_rethrow(error);

    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;

    // Handle known errors
    if (error instanceof AssetNotFoundError) {
      // This shouldn't happen since we check existence above,
      // but handle it gracefully if it does
      return apiError('NOT_FOUND', 'Asset not found');
    }

    logError('assets:share-failed', error);

    // Return generic error to client
    return apiError('INTERNAL_ERROR', 'Failed to generate share link');
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'assets:share' });

/**
 * Revoke the share link for an asset
 *
 * DELETE /api/assets/[id]/share
 *
 * Authorization: Required - only asset owner can revoke
 * Returns: { revoked: boolean } - true if a slug was cleared, false if the
 * asset had no active share link (idempotent)
 *
 * Nulls the asset's shareSlug and invalidates the slug cache, so
 * /s/[slug] and /m/[id] both fail closed for the previously-active link.
 *
 * Error responses:
 * - 401: Unauthorized (not logged in)
 * - 404: Asset not found or not owned by user
 * - 500: Internal server error
 */
async function deleteHandler(
  req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    const userId = principal.userId;

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return apiError('NOT_FOUND', 'Asset not found');
    }

    if (!prisma) {
      return enrollmentUnavailableResponse();
    }

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

    const revokedSlug = await revokeShareSlug(id, userId);
    if (revokedSlug) {
      await invalidateSlugCache(revokedSlug);
    }

    return NextResponse.json({ revoked: revokedSlug !== null });
  } catch (error) {
    unstable_rethrow(error);

    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;

    if (error instanceof AssetNotFoundError) {
      return apiError('NOT_FOUND', 'Asset not found');
    }

    logError('assets:share-revoke-failed', error);

    return apiError('INTERNAL_ERROR', 'Failed to revoke share link');
  }
}

export const DELETE = withObservability(withAuthenticatedApi(deleteHandler), { operation: 'assets:share-revoke' });
