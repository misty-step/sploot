import { NextRequest } from 'next/server';
import { isUnauthorizedAuthError } from './api';
import type {
  AuthPolicy,
  AuthenticatedPrincipal,
  RequestAuthResult,
} from './types';
import { extractUploadToken, verifyUploadToken } from './upload-token';
import { verifyBearerOrThrow } from './verify-bearer';
import { isEnrollmentUnavailableError } from '@/lib/enrollment/enrollment-policy';

const DEFAULT_AUTH_POLICY: Required<
  Pick<AuthPolicy, 'allowClerk' | 'allowQaLocal' | 'allowUploadToken'>
> = {
  allowClerk: true,
  allowQaLocal: true,
  allowUploadToken: false,
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
  const hasQaInput = Boolean(req.headers.get('x-sploot-qa-auth') || req.headers.get('cookie')?.split(';').some((part) => part.trim().startsWith('sploot_qa_auth=')));

  if (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD === 'true' && resolvedPolicy.allowQaLocal && hasQaInput) {
    const { getQaProofRequestContext, verifyQaLocalAuthHeaders } = await import('./qa-local');
    const requestContext = getQaProofRequestContext(req.headers);
    requestContext.host = requestHostname(req) || requestContext.host;
    const qaResult = await verifyQaLocalAuthHeaders(req.headers, env, requestContext);
    // QA credentials are terminal input. A malformed, expired, disabled, or
    // otherwise forbidden QA credential must never fall through to Clerk.
    return qaResult;
  }

  if (resolvedPolicy.allowUploadToken) {
    const uploadToken = extractUploadToken(req.headers);
    if (uploadToken) {
      let principal: Awaited<ReturnType<typeof verifyUploadToken>>;
      try {
        principal = await verifyUploadToken(uploadToken);
      } catch (error: unknown) {
        if (isEnrollmentUnavailableError(error)) {
          return { status: 'unavailable', reason: 'enrollment_unavailable' };
        }
        throw error;
      }
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
      // Durable enrollment is asserted by withAuthenticatedApi immediately
      // after authentication, before a route receives the principal.
      syncStatus: 'skipped',
    };
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      return { status: 'unauthenticated', reason: 'clerk-unauthorized' };
    }

    return { status: 'unavailable', reason: 'enrollment_unavailable' };
  }
}

function requestHostname(req: NextRequest): string {
  if (req.nextUrl?.hostname) return req.nextUrl.hostname;
  try {
    return new URL(req.url).hostname;
  } catch {
    // A malformed synthetic request cannot crash authentication. Retain the
    // signed QA context's host so verification still fails closed on mismatch.
    return '';
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
