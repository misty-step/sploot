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
      const responseBody = {
        success: false,
        error: 'paste an image url to import',
      } satisfies SplootApiUploadResponse;
    return NextResponse.json(
      responseBody,
      { status: 400 }
    );
  }

  const validation = validateImportUrl(rawUrl);
  if (!validation.ok) {
      const responseBody = {
        success: false,
        error: validation.reason,
      } satisfies SplootApiUploadResponse;
    return NextResponse.json(responseBody, { status: 400 });
  }

  const fetched = await fetchRemoteImage(validation.url);
  if (!fetched.ok) {
    logger.info('URL import fetch rejected', { userId, reason: fetched.reason });
      const responseBody = {
        success: false,
        error: fetched.reason,
      } satisfies SplootApiUploadResponse;
    return NextResponse.json(responseBody, { status: 422 });
  }

  try {
    const result = await ingestImage({ userId, file: fetched.file });

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
    if (error instanceof StorageQuotaExceededError) {
      const responseBody = storageQuotaError(error.snapshot) satisfies SplootApiUploadResponse;
      return NextResponse.json(responseBody, { status: 403 });
    }

    logger.error('URL import failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    const responseBody = {
      success: false,
      error: 'Upload failed',
    } satisfies SplootApiUploadResponse;
    return NextResponse.json(responseBody, { status: 500 });
  }
}, { allowUploadToken: true });

export const POST = withObservability(postHandler, { operation: 'upload:url' });
