import { NextRequest } from 'next/server';
import { isUnauthorizedAuthError } from './api';
import { verifyQaLocalAuthHeaders } from './qa-local';
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
  requireUserSync: false,
};

export async function authenticateRequest(
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
    if (qaResult.status !== 'unauthenticated' && qaResult.status !== 'forbidden') {
      return qaResult;
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
    return {
      status: 'authenticated',
      principal: clerkPrincipal(userId),
      syncStatus: resolvedPolicy.requireUserSync ? 'skipped' : 'skipped',
    };
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      return { status: 'unauthenticated', reason: 'clerk-unauthorized' };
    }

    throw error;
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
