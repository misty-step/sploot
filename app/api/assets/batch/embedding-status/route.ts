import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';

interface BatchEmbeddingStatusRequest {
  assetIds: string[];
}

interface AssetEmbeddingStatus {
  hasEmbedding: boolean;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error?: string;
}

interface BatchEmbeddingStatusResponse {
  statuses: {
    [assetId: string]: AssetEmbeddingStatus;
  };
}

/**
 * POST /api/assets/batch/embedding-status
 * Check embedding status for multiple assets in a single request
 *
 * Request body: { assetIds: string[] }
 * Response: { statuses: { [assetId]: { hasEmbedding, status, error? } } }
 */
async function postHandler(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Parse request body
    const body: BatchEmbeddingStatusRequest = await request.json();
    const { assetIds } = body;

    // Validate input
    if (!assetIds || !Array.isArray(assetIds)) {
      return NextResponse.json(
        { error: 'Invalid request: assetIds must be an array' },
        { status: 400 }
      );
    }

    if (assetIds.length === 0) {
      return NextResponse.json({
        statuses: {},
      });
    }

    // Enforce max batch size
    const MAX_BATCH_SIZE = 50;
    if (assetIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} assets` },
        { status: 400 }
      );
    }

    // Fetch all assets and their embedding status in a single query
    const assets = await prisma.asset.findMany({
      where: {
        id: {
          in: assetIds,
        },
        ownerUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        embedding: {
          select: {
            assetId: true,
            modelName: true,
            createdAt: true,
          },
        },
        // Include embedding status fields from Asset model if they exist
        // These would be added based on the TODO implementation
      },
    });

    // Build the status map
    const statuses: BatchEmbeddingStatusResponse['statuses'] = {};

    // Mark found assets
    for (const asset of assets) {
      let status: AssetEmbeddingStatus['status'] = 'pending';
      let error: string | undefined;

      if (asset.embedding) {
        status = 'ready';
      } else {
        // Check if we have additional status information
        // This could be enhanced based on embeddingStatus field from Asset type
        status = 'pending';
      }

      statuses[asset.id] = {
        hasEmbedding: !!asset.embedding,
        status,
        ...(error && { error }),
      };
    }

    // Mark missing assets as not found
    for (const assetId of assetIds) {
      if (!(assetId in statuses)) {
        statuses[assetId] = {
          hasEmbedding: false,
          status: 'failed',
          error: 'Asset not found or access denied',
        };
      }
    }

    const responseTime = Date.now() - startTime;

    // Log performance metrics for monitoring
    if (responseTime > 100) {
      console.warn(`[perf] Batch embedding status took ${responseTime}ms for ${assetIds.length} assets`);
    }

    return NextResponse.json({
      statuses,
    });
  } catch (error) {
    console.error('Error checking batch embedding status:', error);
    return NextResponse.json(
      { error: 'Failed to check batch embedding status' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(postHandler, {
  operation: 'assets:batch-embedding-status',
});
