import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi, type AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';

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
async function getHandler(_req: NextRequest, _context: RouteContext, { principal, auth }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;
    const { syncStatus, syncError } = auth;

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

export const GET = withObservability(withAuthenticatedApi(getHandler, { requireUserSync: true }), {
  operation: 'health:user-sync',
  skipTiming: true,
});
