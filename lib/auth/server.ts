import { syncUser } from '../db';

interface AuthResult {
  userId: string | null;
  sessionId: string | null;
  getToken: (options?: any) => Promise<string | null>;
}

interface AuthWithUserResult extends AuthResult {
  userEmail?: string;
}

export async function getAuth(): Promise<AuthResult> {
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
  const clerk = await import('@clerk/nextjs/server');
  const { logger } = await import('../observability-logger');
  const Sentry = await import('@sentry/nextjs');

  const authResult = await clerk.auth();

  if (!authResult.userId) {
    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as any,
    };
  }

  try {
    // Get the full user details from Clerk
    const user = await clerk.currentUser();
    if (user) {
      const email = user.emailAddresses[0]?.emailAddress || `${authResult.userId}@clerk.local`;

      // Ensure user exists in database with error handling
      try {
        await syncUser(authResult.userId, email);
      } catch (dbError) {
        // Log database sync error but don't block authentication
        logger.logError('auth:db-sync-failed', dbError as Error, {
          userId: authResult.userId,
          email,
        });

        // Report to Sentry
        Sentry.captureException(dbError, {
          tags: {
            'auth.action': 'user-sync',
            'auth.userId': authResult.userId,
          },
          contexts: {
            user: {
              id: authResult.userId,
              email,
            },
          },
        });

        // If DB sync fails, do not proceed with authentication for this request
        logger.logError('auth:sync-failed-blocking-auth', dbError as Error, {
          userId: authResult.userId,
          email,
          reason: 'Database sync failed, blocking authentication to prevent further errors',
        });
        return {
          userId: null,
          sessionId: null,
          getToken: authResult.getToken as any,
        };
      }

      return {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        getToken: authResult.getToken as any,
        userEmail: email,
      };
    }

    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as any,
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
