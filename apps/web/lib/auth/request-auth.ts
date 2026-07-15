import { NextRequest } from 'next/server';
import { isUnauthorizedAuthError } from './api';
import { verifyQaLocalAuthHeaders } from './qa-local';
import { syncClerkUser } from './user-sync';
import type {
  AuthPolicy,
  AuthenticatedPrincipal,
  RequestAuthResult,
} from './types';
import { extractUploadToken, verifyUploadToken } from './upload-token';
import { verifyBearerOrThrow } from './verify-bearer';

const DEFAULT_AUTH_POLICY: Required<
  Pick<AuthPolicy, 'allowClerk' | 'allowQaLocal' | 'allowUploadToken' | 'requireUserSync'>
> = {
  allowClerk: true,
  allowQaLocal: true,
  allowUploadToken: false,
  // A Clerk principal is not usable by a tenant route until its application
  // identity has been confirmed. QA-local and personal-token branches return
  // before this policy and carry their explicit `skipped` semantics.
  requireUserSync: true,
};

export async function authenticateRequest(
  req: NextRequest,
  policy: AuthPolicy = {}
): Promise<RequestAuthResult> {
  try {
    return await authenticateRequestUnsafe(req, policy);
  } catch {
    // Provider, credential-store, and crypto failures must not escape as
    // framework 500s or disclose provider/database details.
    return {
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
      reason: 'Authentication provider unavailable',
    };
  }
}

async function authenticateRequestUnsafe(
  req: NextRequest,
  policy: AuthPolicy = {}
): Promise<RequestAuthResult> {
  const resolvedPolicy = {
    ...DEFAULT_AUTH_POLICY,
    ...policy,
  };
  const env = resolvedPolicy.env ?? process.env;

  if (resolvedPolicy.allowQaLocal) {
    const qaResult = await verifyQaLocalAuthHeaders(req.headers, env);
    if (qaResult.status === 'authenticated') {
      return qaResult;
    }

    // A QA credential is terminal. Never let an invalid/disabled QA cookie
    // fall through to Clerk and accidentally authenticate a different tenant.
    if (qaResult.reason !== 'qa-local-missing') {
      return qaResult.status === 'forbidden'
        ? { status: 'unauthenticated', reason: qaResult.reason }
        : qaResult;
    }
  }

  if (resolvedPolicy.allowUploadToken) {
    const uploadToken = extractUploadToken(req.headers);
    if (uploadToken) {
      const principal = await verifyUploadToken(uploadToken);
      if (principal) {
        return { status: 'authenticated', principal, syncStatus: 'skipped' };
      }
      // A splt_ bearer was presented but is invalid or revoked. It is
      // unambiguously an upload-token attempt, so do not fall through to Clerk.
      return { status: 'unauthenticated', reason: 'upload-token-invalid' };
    }
  }

  if (!resolvedPolicy.allowClerk || !hasClerkServerConfig(env)) {
    return { status: 'unauthenticated', reason: 'clerk-unavailable' };
  }

  try {
    const userId = await verifyBearerOrThrow(req);
    const principal = clerkPrincipal(userId);
    const sync = resolvedPolicy.requireUserSync
      ? await syncClerkUser(userId)
      : { syncStatus: 'skipped' as const };

    if (sync.failureCode) {
      return {
        status: 'boundary-failure',
        code: sync.failureCode,
        httpStatus: sync.failureCode === 'identity_missing'
          || sync.failureCode === 'identity_mismatch'
          ? 401
          : sync.failureCode === 'sync_conflict'
            ? 409
            : 503,
        retryable: sync.retryable ?? sync.failureCode === 'sync_unavailable',
        reason: sync.syncError ?? sync.failureCode,
      };
    }

    if (sync.email) {
      principal.email = sync.email;
    }

    return {
      status: 'authenticated',
      principal,
      syncStatus: sync.syncStatus,
      ...(sync.syncError ? { syncError: sync.syncError } : {}),
    };
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      return { status: 'unauthenticated', reason: 'clerk-unauthorized' };
    }

    return {
      status: 'boundary-failure',
      code: 'sync_unavailable',
      httpStatus: 503,
      retryable: true,
      reason: 'Clerk authentication provider unavailable',
    };
  }
}

export function hasClerkServerConfig(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CLERK_SECRET_KEY && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

function clerkPrincipal(userId: string): AuthenticatedPrincipal {
  return {
    userId,
    provider: 'clerk',
    providerSubject: userId,
    source: 'clerk-request',
    credentialKind: 'cookie-or-bearer',
  };
}
