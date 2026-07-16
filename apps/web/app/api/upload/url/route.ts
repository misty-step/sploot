import { NextRequest, NextResponse } from 'next/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { ingestImage } from '@/lib/upload/ingest-image';
import { validateImportUrl, fetchRemoteImage } from '@/lib/upload/url-import';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import {
  storageQuotaError,
  StorageQuotaExceededError,
} from '@/lib/quota/storage-quota-policy';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
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
 * URL import endpoint: POST { url } fetches a remote image server-side and
 * ingests it through the shared pipeline (same dedupe/quota semantics and
 * response contracts as /api/upload).
 */

export const maxDuration = 60;

const postHandler = withAuthenticatedApi(async (req: NextRequest, _context, { principal }) => {
  const userId = principal.userId;

  const uploadGate = getRuntimeGate('uploads');
  if (!uploadGate.enabled) {
    return runtimeGateResponse(uploadGate);
  }

  let rawUrl: unknown;
  try {
    const body = await req.json();
    rawUrl = body?.url;
  } catch {
    rawUrl = undefined;
  }

  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return NextResponse.json(
      { success: false, error: 'paste an image url to import' },
      { status: 400 }
    );
  }

  const validation = validateImportUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ success: false, error: validation.reason }, { status: 400 });
  }

  try {
    // Reject non-enrolled callers before spending server/network work on the
    // remote fetch. ingestImage repeats this boundary before Blob/embedding work.
    await assertEnrolledUser(userId, prisma);

    const fetched = await fetchRemoteImage(validation.url);
    if (!fetched.ok) {
      logger.info('URL import fetch rejected', { userId, reason: fetched.reason });
      return NextResponse.json({ success: false, error: fetched.reason }, { status: 422 });
    }

    const result = await ingestImage({ userId, file: fetched.file });

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
    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // Typed embedding outcomes keep their Retry-After contract below; only
    // genuine enrollment failures take the duck-typed enrollment path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingError)) {
      return enrollmentUnavailableResponse();
    }

    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(storageQuotaError(error.snapshot), { status: 403 });
    }

    if (error instanceof EmbeddingError) {
      const isConfiguration = 'reason' in error && error.reason === 'embedding_configuration';
      if (isConfiguration) {
        await reportEmbeddingConfigurationErrorOnce(error, 'upload:url:embedding-configuration');
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

    logger.error('URL import failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 });
  }
}, { allowUploadToken: true });

export const POST = withObservability(postHandler, { operation: 'upload:url' });
