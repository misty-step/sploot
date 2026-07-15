import { NextRequest, NextResponse } from 'next/server';
import type { RouteContext } from '@/lib/with-observability';
import { unauthorizedResponse } from './api';
import { authenticateRequest } from './request-auth';
import type { AuthPolicy, AuthenticatedPrincipal, RequestAuthResult } from './types';
import { prisma } from '@/lib/db';
import { assertEnrolledUser, enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { recordUploadTokenUsage } from './upload-token';

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

    if (auth.status === 'unavailable') {
      return enrollmentUnavailableResponse();
    }

    if (auth.status === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden', code: 'qa_auth_forbidden' }, { status: 403 });
    }

    if (auth.status !== 'authenticated') {
      return unauthorizedResponse();
    }

    try {
      await assertEnrolledUser(auth.principal.userId, prisma);
    } catch (error) {
      const enrollmentResponse = enrollmentResponseForError(error);
      if (enrollmentResponse) return enrollmentResponse;
      throw error;
    }

    // Authentication is pure. Usage telemetry is deliberately recorded only
    // after the durable enrollment receipt has been proven, so an upload
    // token cannot write lastUsedAt for an unenrolled identity.
    if (auth.principal.credentialKind === 'upload-token' && 'uploadTokenId' in auth.principal && typeof auth.principal.uploadTokenId === 'string') {
      try {
        await recordUploadTokenUsage(auth.principal.uploadTokenId);
      } catch (error: unknown) {
        const usageResponse = enrollmentResponseForError(error);
        if (usageResponse) return usageResponse;
        throw error;
      }
    }

    return handler(req, context, {
      principal: auth.principal,
      auth,
    });
  };
}
