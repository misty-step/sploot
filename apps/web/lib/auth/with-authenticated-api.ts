import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from '@/lib/with-observability';
import { unauthorizedResponse } from './api';
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

    if (auth.status !== 'authenticated') {
      return unauthorizedResponse();
    }

    return handler(req, context, {
      principal: auth.principal,
      auth,
    });
  };
}
