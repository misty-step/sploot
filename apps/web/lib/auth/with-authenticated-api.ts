import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from '@/lib/with-observability';
import { unauthorizedResponse } from './api';
import { signInRedirectUrl } from './redirects';
import { authenticateRequest } from './request-auth';
import type { AuthPolicy, AuthenticatedPrincipal, RequestAuthResult } from './types';

export interface AuthenticatedApiContext {
  principal: AuthenticatedPrincipal;
  auth: Extract<RequestAuthResult, { status: 'authenticated' }>;
}

export type AuthenticatedApiHandler<Context extends RouteContext = RouteContext> = (
  req: NextRequest,
  context: Context,
  auth: AuthenticatedApiContext
) => Promise<Response | NextResponse>;

export function withAuthenticatedApi<Context extends RouteContext = RouteContext>(
  handler: AuthenticatedApiHandler<Context>,
  policy: AuthPolicy = {}
) {
  return async function authenticatedHandler(
    req: NextRequest,
    context: Context
  ): Promise<Response | NextResponse> {
    const auth = await authenticateRequest(req, policy);

    if (auth.status === 'unauthenticated' || auth.status === 'forbidden') {
      if (policy.unauthenticated === 'sign-in-redirect') {
        return NextResponse.redirect(signInRedirectUrl(req), 303);
      }
      return unauthorizedResponse();
    }

    if (auth.status === 'boundary-failure') {
      if (auth.code === 'identity_missing' || auth.code === 'identity_mismatch') {
        return NextResponse.json({ error: 'Unauthorized', code: auth.code }, { status: 401 });
      }

      return NextResponse.json(
        {
          error: auth.code === 'sync_conflict'
            ? 'Authentication identity conflict'
            : 'Authentication temporarily unavailable',
          code: auth.code,
          retryable: auth.retryable,
        },
        { status: auth.httpStatus }
      );
    }

    return handler(req, context, {
      principal: auth.principal,
      auth,
    });
  };
}
