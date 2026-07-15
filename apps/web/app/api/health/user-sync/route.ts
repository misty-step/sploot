import { NextRequest, NextResponse } from 'next/server';
import { getAuthWithUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentIdentityConflictResponse,
  enrollmentResponseForError,
  enrollmentUnavailableResponse,
} from '@/lib/enrollment/enrollment-policy';

/**
 * User Sync Health Check Endpoint
 *
 * Ousterhout Principle: Deep Module
 * - Simple interface: GET /api/health/user-sync
 * - Rich functionality: checks auth, DB sync, user existence, asset count
 * - Exposes important information: reveals all critical system state
 *
 * Returns comprehensive health status for user sync system
 */
async function getHandler(req: NextRequest) {
  try {
    // Get auth with explicit sync status
    const { userId, syncStatus, syncError } = await getAuthWithUser();

    if (syncStatus === 'denied') return enrollmentDeniedResponse();
    if (syncStatus === 'conflict') return enrollmentIdentityConflictResponse();
    if (syncStatus === 'unavailable' || syncStatus === 'failed') return enrollmentUnavailableResponse();

    if (!userId) {
      return NextResponse.json({
        status: 'unauthenticated',
        healthy: false,
        message: 'User not authenticated',
      });
    }

    await assertEnrolledUser(userId, prisma);

    // Check if user actually exists in database
    const dbUser = await prisma?.user.findUnique({
      where: { id: userId },
    });

    // Check if user has any assets
    const assetCount = await prisma?.asset.count({
      where: {
        ownerUserId: userId,
        deletedAt: null,
      },
    });

    // Determine overall health
    const healthy = syncStatus === 'success' && !!dbUser;

    return NextResponse.json({
      userId,
      syncStatus,
      syncError: syncError || null,
      userExistsInDb: !!dbUser,
      assetCount: assetCount ?? 0,
      healthy,
      message: healthy
        ? 'User sync healthy'
        : `User sync unhealthy: ${syncError || 'User not found in database'}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    return NextResponse.json(
      {
        status: 'error',
        healthy: false,
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, {
  operation: 'health:user-sync',
  skipTiming: true,
});
