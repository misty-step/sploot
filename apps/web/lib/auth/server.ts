import { syncClerkUser } from './user-sync';
import { verifyQaLocalAuthHeaders } from './qa-local';
import type { AuthFailureCode, RequestAuthResult } from './types';

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
  authFailure?: {
    code: AuthFailureCode;
    httpStatus: 401 | 409 | 503;
    retryable: boolean;
  };
}

export async function getAuth(): Promise<AuthResult> {
  try {
    const qaAuth = await getQaLocalAuthFromCurrentRequest();
    if (qaAuth?.status === 'authenticated') {
      return {
        userId: qaAuth.principal.userId,
        sessionId: qaAuth.principal.sessionId ?? null,
        getToken: async () => null,
      };
    }
    if (isTerminalQaResult(qaAuth)) return emptyAuthResult();

    const clerk = await import('@clerk/nextjs/server');
    const auth = await clerk.auth();
    return {
      userId: auth.userId,
      sessionId: auth.sessionId,
      getToken: auth.getToken as any,
    };
  } catch {
    // The landing page remains public when Clerk is unavailable; it must not
    // turn a provider outage into an unredacted framework error.
    return emptyAuthResult();
  }
}

/**
 * Get authenticated user and ensure they exist in the database
 * This automatically syncs Clerk users with our database
 */
export async function getAuthWithUser(): Promise<AuthWithUserResult> {
  try {
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
    if (isTerminalQaResult(qaAuth)) return emptySyncedAuthResult();

    const clerk = await import('@clerk/nextjs/server');
    const authResult = await clerk.auth();

    if (!authResult.userId) {
      return {
        userId: authResult.userId,
        sessionId: authResult.sessionId,
        getToken: authResult.getToken as any,
        syncStatus: 'skipped', // No user to sync
      };
    }

    const sync = await syncClerkUser(authResult.userId);
    if (sync.failureCode) {
      return {
        userId: null,
        sessionId: authResult.sessionId,
        getToken: authResult.getToken as any,
        syncStatus: 'failed',
        syncError: 'Authentication identity synchronization unavailable',
        authFailure: {
          code: sync.failureCode,
          httpStatus: sync.failureCode === 'identity_missing' || sync.failureCode === 'identity_mismatch'
            ? 401
            : sync.failureCode === 'sync_conflict' ? 409 : 503,
          retryable: sync.retryable ?? sync.failureCode === 'sync_unavailable',
        },
      };
    }

    return {
      userId: authResult.userId,
      sessionId: authResult.sessionId,
      getToken: authResult.getToken as any,
      ...(sync.email ? { userEmail: sync.email } : {}),
      syncStatus: sync.syncStatus,
    };
  } catch {
    return {
      ...emptySyncedAuthResult(),
      syncError: 'Authentication provider unavailable',
      authFailure: {
        code: 'sync_unavailable',
        httpStatus: 503,
        retryable: true,
      },
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
  const { userId, syncStatus, authFailure } = await getAuthWithUser();
  if (!userId) {
    throw new AuthBoundaryError(authFailure?.code ?? 'identity_missing');
  }
  if (syncStatus === 'failed') {
    throw new AuthBoundaryError(authFailure?.code ?? 'sync_unavailable');
  }
  return userId;
}

export class AuthBoundaryError extends Error {
  readonly code: AuthFailureCode;

  constructor(code: AuthFailureCode) {
    super(code === 'identity_missing' || code === 'identity_mismatch'
      ? 'Unauthorized'
      : 'Authentication temporarily unavailable');
    this.name = 'AuthBoundaryError';
    this.code = code;
  }
}

function emptyAuthResult(): AuthResult {
  return { userId: null, sessionId: null, getToken: async () => null };
}

function emptySyncedAuthResult(): AuthWithUserResult {
  return { ...emptyAuthResult(), syncStatus: 'failed' };
}

function isTerminalQaResult(result: RequestAuthResult | null): boolean {
  return result?.status === 'unauthenticated' && result.reason !== 'qa-local-missing';
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
