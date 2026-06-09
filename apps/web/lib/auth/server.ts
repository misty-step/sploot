import { syncUser } from '../db';
import { getUserSyncCircuitBreaker } from '../circuit-breaker';
import { verifyQaLocalAuthHeaders } from './qa-local';
import type { RequestAuthResult } from './types';

interface AuthResult {
  userId: string | null;
  sessionId: string | null;
  getToken: (options?: any) => Promise<string | null>;
}

interface AuthWithUserResult extends AuthResult {
  userEmail?: string;
  /**
   * Database sync status
   * - 'success': User successfully synced to database
   * - 'failed': Sync failed, data operations may fail
   * - 'skipped': No sync attempted (user not authenticated)
   */
  syncStatus: 'success' | 'failed' | 'skipped';
  /**
   * Error message if sync failed (for debugging/logging only)
   */
  syncError?: string;
}

export async function getAuth(): Promise<AuthResult> {
  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (qaAuth?.status === 'authenticated') {
    return {
      userId: qaAuth.principal.userId,
      sessionId: qaAuth.principal.sessionId ?? null,
      getToken: async () => null,
    };
  }
  const clerk = await import('@clerk/nextjs/server');
  const auth = await clerk.auth();
  return {
    userId: auth.userId,
    sessionId: auth.sessionId,
    getToken: auth.getToken as any,
  };
}

/**
 * Get authenticated user and ensure they exist in the database
 * This automatically syncs Clerk users with our database
 */
export async function getAuthWithUser(): Promise<AuthWithUserResult> {
  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (qaAuth?.status === 'authenticated') {
    return {
      userId: qaAuth.principal.userId,
      sessionId: qaAuth.principal.sessionId ?? null,
      getToken: async () => null,
      userEmail: qaAuth.principal.email,
      syncStatus: 'skipped',
    };
  }
  const clerk = await import('@clerk/nextjs/server');
  const { logger } = await import('../observability-logger');
  const Sentry = await import('@sentry/nextjs');

  const authResult = await clerk.auth();

  if (!authResult.userId) {
    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as any,
      syncStatus: 'skipped', // No user to sync
    };
  }

  try {
    // Get the full user details from Clerk
    const user = await clerk.currentUser();
    if (user) {
      const email = user.emailAddresses[0]?.emailAddress || `${authResult.userId}@clerk.local`;

      // Ensure user exists in database with error handling
      // Ousterhout: Fail Fast - use circuit breaker to avoid repeated failures
      try {
        const circuitBreaker = getUserSyncCircuitBreaker();

        await circuitBreaker.execute(async () => {
          await syncUser(authResult.userId, email);
        });

        // Sync succeeded - return success status
        return {
          userId: authResult.userId,
          sessionId: authResult.sessionId,
          getToken: authResult.getToken as any,
          userEmail: email,
          syncStatus: 'success',
        };
      } catch (dbError) {
        // Check if circuit breaker is open (too many failures)
        const isCircuitOpen = (dbError as Error).message.includes('Circuit breaker is OPEN');

        // Log database sync error but don't block authentication
        logger.logError('auth:db-sync-failed', dbError as Error, {
          userId: authResult.userId,
          email,
          circuitBreakerOpen: isCircuitOpen,
        });

        // Report to Sentry with critical tag for alerting
        Sentry.captureException(dbError, {
          level: 'error',
          tags: {
            'auth.action': 'user-sync',
            'auth.userId': authResult.userId,
            'critical': 'true', // Tag for alerting
            'circuit-breaker': isCircuitOpen ? 'open' : 'closed',
          },
          contexts: {
            user: {
              id: authResult.userId,
              email,
            },
          },
          fingerprint: ['user-sync-failure', authResult.userId], // Group by user
        });

        // Allow authentication to proceed but expose sync failure
        logger.logInfo('auth:proceeding-without-db-sync', {
          userId: authResult.userId,
          reason: isCircuitOpen
            ? 'Circuit breaker open - too many sync failures'
            : 'Database sync failed but allowing authentication',
        });

        // Sync failed - return failure status with error details
        return {
          userId: authResult.userId,
          sessionId: authResult.sessionId,
          getToken: authResult.getToken as any,
          userEmail: email,
          syncStatus: 'failed',
          syncError: (dbError as Error).message,
        };
      }
    }

    // No user object from Clerk - skip sync
    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as any,
      syncStatus: 'skipped',
    };
  } catch (error) {
    // Log unexpected error in auth flow
    logger.logError('auth:unexpected-error', error as Error, {
      userId: authResult.userId,
    });

    // Report to Sentry
    Sentry.captureException(error, {
      tags: {
        'auth.action': 'get-user',
        'auth.userId': authResult.userId,
      },
    });

    // Re-throw to trigger error boundary
    throw error;
  }
}

export async function requireUserId(): Promise<string> {
  const { userId } = await getAuth();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

/**
 * Require authenticated user and ensure they exist in database
 * Use this for any endpoint that writes to the database
 */
export async function requireUserIdWithSync(): Promise<string> {
  const { userId } = await getAuthWithUser();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

async function getQaLocalAuthFromCurrentRequest(): Promise<RequestAuthResult | null> {
  try {
    const { headers } = await import('next/headers');
    const requestHeaders = await headers();
    return await verifyQaLocalAuthHeaders(requestHeaders as unknown as Headers);
  } catch {
    return null;
  }
}
