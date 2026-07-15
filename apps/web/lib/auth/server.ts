import { syncUser } from '../db';
import { prisma } from '../db';
import { isUnauthorizedAuthError } from './api';
import { getUserSyncCircuitBreaker } from '../circuit-breaker';
import { hasQaLocalAuthInput, verifyQaLocalAuthHeaders } from './qa-local';
import { isCompiledPublicTruthE2EBuild } from '@/lib/public-truth-e2e';
import type { RequestAuthResult } from './types';
import {
  EnrollmentDeniedError,
  EnrollmentIdentityConflictError,
  EnrollmentUnavailableError,
  ENROLLMENT_DENIAL_CODE,
  ENROLLMENT_UNAVAILABLE_CODE,
  ENROLLMENT_IDENTITY_CONFLICT_CODE,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
  isEnrollmentIdentityConflictError,
  assertEnrolledUser,
} from '@/lib/enrollment/enrollment-policy';

interface AuthResult {
  userId: string | null;
  sessionId: string | null;
  getToken: (options?: unknown) => Promise<string | null>;
}

interface AuthWithUserResult extends AuthResult {
  userEmail?: string;
  /**
   * Database sync status
   * - 'success': User successfully synced to database
   * - 'failed': Sync failed, data operations may fail
   * - 'unavailable': Enrollment database boundary unavailable
   * - 'skipped': No sync attempted (user not authenticated)
   */
  syncStatus: 'success' | 'failed' | 'denied' | 'unavailable' | 'conflict' | 'skipped';
  /**
   * Error message if sync failed (for debugging/logging only)
   */
  syncError?: string;
}

export async function getAuth(): Promise<AuthResult> {
  // This branch exists only in the explicitly test-only public-truth build.
  // Production config rejects that build flag; protected middleware remains
  // the security boundary and is exercised separately by the browser gate.
  if (isCompiledPublicTruthE2EBuild()) {
    return { userId: null, sessionId: null, getToken: async () => null };
  }

  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (qaAuth?.status === 'authenticated') {
    return {
      userId: qaAuth.principal.userId,
      sessionId: qaAuth.principal.sessionId ?? null,
      getToken: async () => null,
    };
  }
  if (qaAuth?.terminal) {
    return { userId: null, sessionId: null, getToken: async () => null };
  }
  const clerk = await import('@clerk/nextjs/server');
  let auth: Awaited<ReturnType<typeof clerk.auth>>;
  try {
    auth = await clerk.auth();
  } catch {
    throw new EnrollmentUnavailableError();
  }
  return {
    userId: auth.userId,
    sessionId: auth.sessionId,
    getToken: auth.getToken as unknown as AuthResult['getToken'],
  };
}

/**
 * Get authenticated user and ensure they exist in the database
 * This automatically syncs Clerk users with our database
 */
export async function getAuthWithUser(): Promise<AuthWithUserResult> {
  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (qaAuth?.status === 'authenticated') {
    let syncStatus: AuthWithUserResult['syncStatus'] = 'success';
    let syncError: string | undefined;
    try {
      await assertEnrolledUser(qaAuth.principal.userId, prisma);
    } catch (error: unknown) {
      if (isEnrollmentDeniedError(error)) {
        syncStatus = 'denied';
        syncError = ENROLLMENT_DENIAL_CODE;
      } else if (isEnrollmentUnavailableError(error)) {
        syncStatus = 'unavailable';
        syncError = ENROLLMENT_UNAVAILABLE_CODE;
      } else if (isEnrollmentIdentityConflictError(error)) {
        syncStatus = 'conflict';
        syncError = ENROLLMENT_IDENTITY_CONFLICT_CODE;
      } else {
        throw error;
      }
    }
    return {
      userId: syncStatus === 'success' ? qaAuth.principal.userId : null,
      sessionId: qaAuth.principal.sessionId ?? null,
      getToken: async () => null,
      userEmail: qaAuth.principal.email,
      syncStatus,
      syncError,
    };
  }
  if (qaAuth?.terminal) {
    return {
      userId: null,
      sessionId: null,
      getToken: async () => null,
      syncStatus: 'failed',
      syncError: 'qa_auth_terminal',
    };
  }
  const clerk = await import('@clerk/nextjs/server');
  const { logger } = await import('../observability-logger');

  let authResult: Awaited<ReturnType<typeof clerk.auth>>;
  try {
    authResult = await clerk.auth();
  } catch (error) {
    logger.logError('auth:provider-unavailable', error as Error, {});
    return {
      userId: null,
      sessionId: null,
      getToken: async () => null,
      syncStatus: 'unavailable',
      syncError: 'clerk_unavailable',
    };
  }

  if (!authResult.userId) {
    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as unknown as AuthResult['getToken'],
      syncStatus: 'skipped', // No user to sync
    };
  }

  try {
    // Get the full user details from Clerk
    const user = await clerk.currentUser();
    if (user) {
      if (user.id !== authResult.userId) {
        throw new Error('Unauthorized - Clerk subject mismatch');
      }
      const email = user.emailAddresses[0]?.emailAddress || `${authResult.userId}@clerk.local`;

      // Ensure user exists in database with error handling
      // Ousterhout: Fail Fast - use circuit breaker to avoid repeated failures
      try {
        const circuitBreaker = getUserSyncCircuitBreaker();

        await circuitBreaker.execute(async () => {
          await syncUser(authResult.userId, email);
        }, { ignoreFailure: (error) => isEnrollmentDeniedError(error) || isEnrollmentUnavailableError(error) });

        // Sync succeeded - return success status
        return {
          userId: authResult.userId,
          sessionId: authResult.sessionId,
          getToken: authResult.getToken as unknown as AuthResult['getToken'],
          userEmail: email,
          syncStatus: 'success',
        };
      } catch (dbError) {
        if (isEnrollmentIdentityConflictError(dbError)) {
          return {
            userId: null,
            sessionId: authResult.sessionId,
            getToken: authResult.getToken as unknown as AuthResult['getToken'],
            userEmail: email,
            syncStatus: 'conflict',
            syncError: dbError.code,
          };
        }
        if (isEnrollmentDeniedError(dbError)) {
          return {
            userId: null,
            sessionId: authResult.sessionId,
            getToken: authResult.getToken as unknown as AuthResult['getToken'],
            userEmail: email,
            syncStatus: 'denied',
            syncError: dbError.code,
          };
        }

        if (isEnrollmentUnavailableError(dbError)) {
          return {
            userId: null,
            sessionId: authResult.sessionId,
            getToken: authResult.getToken as unknown as AuthResult['getToken'],
            userEmail: email,
            syncStatus: 'unavailable',
            syncError: dbError.code,
          };
        }

        let durableEnrollment: 'proven' | 'denied' | 'unavailable' = 'unavailable';
        try {
          await assertEnrolledUser(authResult.userId, prisma);
          durableEnrollment = 'proven';
        } catch (enrollmentError) {
          if (isEnrollmentDeniedError(enrollmentError)) durableEnrollment = 'denied';
          else if (isEnrollmentUnavailableError(enrollmentError)) durableEnrollment = 'unavailable';
        }

        if (durableEnrollment === 'denied') {
          return {
            userId: null,
            sessionId: authResult.sessionId,
            getToken: authResult.getToken as unknown as AuthResult['getToken'],
            userEmail: email,
            syncStatus: 'denied',
            syncError: 'enrollment_closed',
          };
        }

        if (durableEnrollment === 'unavailable') {
          return {
            userId: null,
            sessionId: authResult.sessionId,
            getToken: authResult.getToken as unknown as AuthResult['getToken'],
            userEmail: email,
            syncStatus: 'unavailable',
            syncError: 'enrollment_unavailable',
          };
        }

        // A durable enrollment receipt proves this is an existing account;
        // preserve reads even when a secondary sync operation failed.
        const isCircuitOpen = dbError instanceof Error && dbError.message.includes('Circuit breaker is OPEN');

        // Log database sync error but don't block authentication
        logger.logError('auth:db-sync-failed', dbError as Error, {
          userId: authResult.userId,
          email,
          circuitBreakerOpen: isCircuitOpen,
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
          getToken: authResult.getToken as unknown as AuthResult['getToken'],
          userEmail: email,
          syncStatus: 'success',
          syncError: dbError instanceof Error ? dbError.message : String(dbError),
        };
      }
    }

    throw new Error('Unauthorized - Clerk user unavailable');
  } catch (error) {
    // Log unexpected error in auth flow
    logger.logError('auth:unexpected-error', error as Error, {
      userId: authResult.userId,
    });

    if (isUnauthorizedAuthError(error)) throw error;
    return {
      userId: null,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as unknown as AuthResult['getToken'],
      syncStatus: 'unavailable',
      syncError: 'clerk_unavailable',
    };
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
  const result = await getAuthWithUser();
  if (result.syncStatus === 'denied') {
    throw new EnrollmentDeniedError();
  }
  if (result.syncStatus === 'unavailable') {
    throw new EnrollmentUnavailableError();
  }
  if (result.syncStatus === 'failed') {
    throw new EnrollmentUnavailableError();
  }
  if (result.syncStatus === 'conflict') {
    throw new EnrollmentIdentityConflictError();
  }
  const { userId } = result;
  if (!userId) {
    throw new Error('Unauthorized');
  }
  // A status is not an enrollment receipt. Prove the row at the final
  // admission boundary even after a successful sync path; this prevents a
  // stale/failed status from reaching a cost-bearing handler.
  await assertEnrolledUser(userId, prisma);
  return userId;
}

async function getQaLocalAuthFromCurrentRequest(): Promise<(RequestAuthResult & { terminal?: boolean }) | null> {
  try {
    const { headers: getHeaders } = await import('next/headers');
    const requestHeaders = await getHeaders();
    const headerBag = requestHeaders as unknown as Headers;
    if (!hasQaLocalAuthInput(headerBag)) return null;
    const result = await verifyQaLocalAuthHeaders(headerBag);
    return { ...result, terminal: true };
  } catch {
    return null;
  }
}
