import { prisma } from '../db';
import {
  ENROLLMENT_DENIAL_CODE,
  ENROLLMENT_UNAVAILABLE_CODE,
  ENROLLMENT_IDENTITY_CONFLICT_CODE,
  assertEnrolledUser,
  isEnrollmentDeniedError,
  isEnrollmentIdentityConflictError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';
import { hasQaLocalAuthInput, verifyQaLocalAuthHeaders } from './qa-local';
import type { RequestAuthResult } from './types';
import type { AuthResult, AuthWithUserResult } from './server';

/**
 * The qa-local seam for server components and route handlers. This module is
 * reached ONLY through the compile-time NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD gate
 * (a dead-code-eliminated dynamic import in lib/auth/server.ts), so none of
 * its qa-local machinery or marker strings exist in a production bundle —
 * the production public-truth guard proves that omission on every CI run.
 */
async function getQaLocalAuthFromCurrentRequest(): Promise<(RequestAuthResult & { terminal: true }) | null> {
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

/**
 * getAuth-shaped qa resolution: null when the request carries no qa-local
 * input (callers continue to Clerk); a terminal result otherwise.
 */
export async function getQaLocalAuthResult(): Promise<AuthResult | null> {
  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (!qaAuth) return null;
  if (qaAuth.status === 'authenticated') {
    return {
      userId: qaAuth.principal.userId,
      sessionId: qaAuth.principal.sessionId ?? null,
      getToken: async () => null,
    };
  }
  // QA credentials are terminal input: a malformed, expired, or disabled QA
  // credential must never fall through to Clerk.
  return { userId: null, sessionId: null, getToken: async () => null };
}

/**
 * getAuthWithUser-shaped qa resolution with the same durable-enrollment
 * admission proof the Clerk path carries.
 */
export async function getQaLocalAuthWithUserResult(): Promise<AuthWithUserResult | null> {
  const qaAuth = await getQaLocalAuthFromCurrentRequest();
  if (!qaAuth) return null;
  if (qaAuth.status === 'authenticated') {
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
  return {
    userId: null,
    sessionId: null,
    getToken: async () => null,
    syncStatus: 'failed',
    syncError: 'qa_auth_terminal',
  };
}
