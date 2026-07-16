import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { blobConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ingestImage } from '@/lib/upload/ingest-image';
import { prisma } from '@/lib/db';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { UPLOAD } from '@sploot/common';
import {
  storageQuotaError,
  StorageQuotaExceededError,
} from '@/lib/quota/storage-quota-policy';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';
import {
  EmbeddingError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';

/**
 * Configure route segment options
 * maxDuration: Maximum execution time for the API route (60 seconds)
 * This prevents timeout errors for large file uploads
 */
export const maxDuration = 60;

/**
 * Direct file upload endpoint - handles file upload server-side
 *
 * The route handler parses the request and maps results to the API's JSON
 * contracts; the actual pipeline (validate → dedupe → quota → process →
 * blob upload → record → embedding) lives in lib/upload/ingest-image.ts and
 * is shared with every other ingestion surface (share-target, URL import).
 */
async function postHandler(req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  const startTime = Date.now();

  try {
    // Parse request parameters
    const url = new URL(req.url);
    const syncEmbeddings = url.searchParams.get('sync_embeddings') === 'true';

    // Authenticate user: Clerk bearer/cookies, the qa-local harness, or a
    // personal upload token (Apple Shortcut / CLI). allowUploadToken is what
    // makes this an upload-only credential — no other route opts in.
    const userId = principal.userId;

    const uploadGate = getRuntimeGate('uploads');
    if (!uploadGate.enabled) {
      return runtimeGateResponse(uploadGate);
    }

    await assertEnrolledUser(userId, prisma);

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const tagsData = formData.get('tags') as string | null;

    if (!file) {
      logger.info('Upload failed - no file provided', { userId, duration: Date.now() - startTime });
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Parse tags
    let tags: string[] = [];
    if (tagsData) {
      try {
        const parsed = JSON.parse(tagsData);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        logger.warn('Failed to parse tags', { error: String(e) });
        tags = [];
      }
    }

    const result = await ingestImage({ userId, file, tags, syncEmbeddings });

    if (result.kind === 'invalid') {
      return NextResponse.json(
        { success: false, error: result.error.userMessage },
        { status: result.error.statusCode }
      );
    }

    if (result.kind === 'duplicate') {
      return NextResponse.json(
        {
          success: true,
          isDuplicate: true,
          asset: result.asset,
          message: 'This image already exists in your library',
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        isDuplicate: false,
        asset: result.asset,
        message: 'Upload successful',
      },
      { status: 201 }
    );
  } catch (error) {
    unstable_rethrow(error);

    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(storageQuotaError(error.snapshot), { status: 403 });
    }

    // Typed embedding outcomes keep their 429/503 + Retry-After contract and
    // must precede the duck-typed enrollment check (an
    // EmbeddingAdmissionError(limiter_unavailable) carries the shared
    // enrollment_unavailable code).
    if (error instanceof EmbeddingError) {
      const isConfiguration = 'reason' in error && error.reason === 'embedding_configuration';
      if (isConfiguration) {
        await reportEmbeddingConfigurationErrorOnce(error, 'upload:embedding-configuration');
      }
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          reason: 'reason' in error ? error.reason : undefined,
          retryAfter: error.retryAfterSec,
        },
        {
          status: error.statusCode || 503,
          headers: isConfiguration
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    if (isEnrollmentDeniedError(error)) {
      return enrollmentDeniedResponse();
    }

    if (isEnrollmentUnavailableError(error)) {
      return enrollmentUnavailableResponse();
    }

    logger.error('Upload endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime,
    });

    // Return generic error to client, full details logged server-side only
    return NextResponse.json(
      {
        error: 'Upload failed',
        // Only include error details in development for debugging
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : String(error))
          : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for checking upload service status
 */
async function getHandler(_req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  return NextResponse.json({
    status: 'ready',
    blobConfigured,
    limits: {
      maxFileSize: UPLOAD.maxSize,
      allowedTypes: [...UPLOAD.allowedTypes],
    },
  });
}

export const POST = withObservability(withAuthenticatedApi(postHandler, { allowUploadToken: true }), { operation: 'upload:direct' });

export const GET = withObservability(withAuthenticatedApi(getHandler), {
  operation: 'upload:status',
  skipTiming: true,
});
