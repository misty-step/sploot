import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerOrThrow } from '@/lib/auth/verify-bearer';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma, assetExists } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

type UploadCheckAsset = {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  favorite: boolean;
  createdAt: string;
  embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed' | 'unavailable';
};

/**
 * Upload Preflight Check Endpoint
 *
 * This endpoint allows clients to check if an asset already exists before uploading.
 * It accepts a file's SHA256 checksum and returns existing asset metadata if found.
 *
 * @method POST
 * @path /api/upload/check
 *
 * @body {
 *   checksum: string - SHA256 hash of the file to check
 *   mime?: string - Optional MIME type for additional validation
 *   size?: number - Optional file size for additional validation
 * }
 *
 * @returns {
 *   exists: boolean - Whether the asset already exists
 *   asset?: {
 *     id: string - Asset ID
 *     blobUrl: string - URL to access the existing asset
 *     thumbnailUrl?: string - URL to the thumbnail if available
 *     mime: string - MIME type
 *     size: number - File size in bytes
 *     width: number | null
 *     height: number | null
 *     favorite: boolean
 *     createdAt: string - When the asset was first uploaded
 *     embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed' | 'unavailable'
 *   }
 * }
 *
 * @example
 * // Client-side usage
 * import { logger } from '@/lib/observability-logger';
 * const checksum = await calculateSHA256(file);
 * const response = await fetch('/api/upload/check', {
 *   method: 'POST',
 *   body: JSON.stringify({
 *     checksum,
 *     mime: file.type,
 *     size: file.size
 *   }),
 * });
 * const { exists, asset } = await response.json();
 *
 * if (exists) {
 *   // Skip upload and use existing asset
 *   logger.logInfo('upload-check.asset-exists', { asset });
 * } else {
 *   // Proceed with upload
 *   await uploadFile(file);
 * }
 */
async function postHandler(req: NextRequest) {
  try {
    // Check authentication (supports both Bearer token and cookies)
    const userId = await verifyBearerOrThrow(req);

    // Parse request body
    const body = await req.json();
    const { checksum, mime, size } = body;

    // Validate required fields
    if (!checksum || typeof checksum !== 'string') {
      return NextResponse.json(
        { error: 'Checksum is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate checksum format (should be 64 hex characters)
    if (!/^[a-f0-9]{64}$/i.test(checksum)) {
      return NextResponse.json(
        { error: 'Invalid checksum format. Expected SHA256 hash (64 hex characters)' },
        { status: 400 }
      );
    }

    // Check if database is available
    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable. Cannot perform preflight check.' },
        { status: 503 }
      );
    }

    // Check if asset exists with this checksum for the user
    const existingAsset = await assetExists(userId, checksum, {
      includeEmbedding: true,
    });

    if (existingAsset) {
      // Asset already exists - return metadata
      const asset: UploadCheckAsset = {
        id: existingAsset.id,
        blobUrl: existingAsset.blobUrl,
        thumbnailUrl: existingAsset.thumbnailUrl,
        mime: existingAsset.mime,
        size: existingAsset.size,
        width: existingAsset.width,
        height: existingAsset.height,
        favorite: existingAsset.favorite,
        createdAt: existingAsset.createdAt.toISOString(),
        ...(existingAsset.hasEmbedding ? { embeddingStatus: 'ready' as const } : {}),
      };
      return NextResponse.json({
        exists: true,
        asset,
        message: 'Asset already exists in your library',
      });
    }

    // Asset doesn't exist - client can proceed with upload
    return NextResponse.json({
      exists: false,
      message: 'Asset not found. Safe to upload.',
    });

  } catch (error) {
    logError('upload:check-failed', error);

    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    return NextResponse.json(
      { error: 'Failed to perform preflight check' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight requests
 */
async function optionsHandler(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export const POST = withObservability(postHandler, { operation: 'upload:check' });
export const OPTIONS = withObservability(optionsHandler, {
  operation: 'upload:check-options',
  skipTiming: true,
  skipLogging: true,
});
