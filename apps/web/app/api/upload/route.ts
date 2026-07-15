import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { authenticateRequest } from '@/lib/auth/request-auth';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { blobConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { ingestImage } from '@/lib/upload/ingest-image';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { UPLOAD } from '@sploot/common';
import {
  storageQuotaError,
  StorageQuotaExceededError,
} from '@/lib/quota/storage-quota-policy';
import { withObservability } from '@/lib/with-observability';
import type { SplootApiUploadResponse, SplootApiUploadSuccessResponse } from '@sploot/common';

function toPublicUploadAsset(asset: {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
}): SplootApiUploadSuccessResponse['asset'] {
  return {
    id: asset.id,
    blobUrl: asset.blobUrl,
    thumbnailUrl: asset.thumbnailUrl,
  };
}

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
async function postHandler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request parameters
    const url = new URL(req.url);
    const syncEmbeddings = url.searchParams.get('sync_embeddings') === 'true';

    // Authenticate user: Clerk bearer/cookies, the qa-local harness, or a
    // personal upload token (Apple Shortcut / CLI). allowUploadToken is what
    // makes this an upload-only credential — no other route opts in.
    const auth = await authenticateRequest(req, { allowUploadToken: true });
    if (auth.status !== 'authenticated') {
      return unauthorizedResponse();
    }
    const userId = auth.principal.userId;

    const uploadGate = getRuntimeGate('uploads');
    if (!uploadGate.enabled) {
      return runtimeGateResponse(uploadGate);
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const tagsData = formData.get('tags') as string | null;

    if (!file) {
      logger.info('Upload failed - no file provided', { userId, duration: Date.now() - startTime });
      const responseBody = { success: false, error: 'No file provided' } satisfies SplootApiUploadResponse;
      return NextResponse.json(responseBody, { status: 400 });
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
      const responseBody = {
        success: false,
        error: result.error.userMessage,
      } satisfies SplootApiUploadResponse;
      return NextResponse.json(
        responseBody,
        { status: result.error.statusCode }
      );
    }

    if (result.kind === 'duplicate') {
      const responseBody = {
        success: true,
        isDuplicate: true,
        asset: toPublicUploadAsset({
          id: result.asset.id,
          blobUrl: result.asset.blobUrl,
          thumbnailUrl: result.asset.thumbnailUrl,
        }),
        message: 'This image already exists in your library',
      } satisfies SplootApiUploadResponse;
      return NextResponse.json(
        responseBody,
        { status: 409 }
      );
    }

    const responseBody = {
      success: true,
      isDuplicate: false,
      asset: toPublicUploadAsset({
        id: result.asset.id,
        blobUrl: result.asset.blobUrl,
        thumbnailUrl: result.asset.thumbnailUrl,
      }),
      message: 'Upload successful',
    } satisfies SplootApiUploadResponse;
    return NextResponse.json(
      responseBody,
      { status: 201 }
    );
  } catch (error) {
    unstable_rethrow(error);

    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    if (error instanceof StorageQuotaExceededError) {
      const responseBody = storageQuotaError(error.snapshot) satisfies SplootApiUploadResponse;
      return NextResponse.json(responseBody, { status: 403 });
    }

    logger.error('Upload endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime,
    });

    // Return generic error to client, full details logged server-side only
    const responseBody = {
      success: false,
      error: 'Upload failed',
      // Only include error details in development for debugging
      details: process.env.NODE_ENV === 'development'
        ? (error instanceof Error ? error.message : String(error))
        : undefined,
    } satisfies SplootApiUploadResponse;
    return NextResponse.json(responseBody, { status: 500 });
  }
}

/**
 * GET endpoint for checking upload service status
 */
async function getHandler(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth.status !== 'authenticated') {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    status: 'ready',
    blobConfigured,
    limits: {
      maxFileSize: UPLOAD.maxSize,
      allowedTypes: [...UPLOAD.allowedTypes],
    },
  });
}

export const POST = withObservability(postHandler, { operation: 'upload:direct' });

export const GET = withObservability(getHandler, {
  operation: 'upload:status',
  skipTiming: true,
});
