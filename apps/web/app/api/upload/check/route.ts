import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerOrThrow } from '@/lib/auth/verify-bearer';
import { prisma, assetExists } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

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
 *     pathname: string - Path in blob storage
 *     mime: string - MIME type
 *     size: number - File size in bytes
 *     checksumSha256: string - SHA256 checksum
 *     hasEmbedding: boolean - Whether embeddings have been generated
 *     createdAt: Date - When the asset was first uploaded
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
      return NextResponse.json({
        exists: true,
        asset: {
          id: existingAsset.id,
          blobUrl: existingAsset.blobUrl,
          thumbnailUrl: existingAsset.thumbnailUrl,
          pathname: existingAsset.pathname,
          mime: existingAsset.mime,
          size: existingAsset.size,
          width: existingAsset.width,
          height: existingAsset.height,
          checksumSha256: existingAsset.checksumSha256,
          hasEmbedding: existingAsset.hasEmbedding,
          createdAt: existingAsset.createdAt.toISOString(),
        },
        message: 'Asset already exists in your library',
      });
    }

    // Asset doesn't exist - client can proceed with upload
    return NextResponse.json({
      exists: false,
      message: 'Asset not found. Safe to upload.',
    });

  } catch (error) {
    logError('upload:check-failed', error, {});

    // Handle specific error types
    if (error instanceof Error && error.message.includes('auth')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
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
