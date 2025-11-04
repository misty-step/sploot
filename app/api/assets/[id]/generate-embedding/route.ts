import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getAuth } from '@/lib/auth/server';
import { broadcastEmbeddingUpdate } from '@/lib/sse-broadcaster';
import { withObservability } from '@/lib/with-observability';

// Request deduplication: Track in-flight requests
const inFlightRequests = new Map<string, Promise<any>>();

// Circuit breaker state
let circuitBreakerState: {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  resetTime: number;
} = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: 0,
  resetTime: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 3; // Open after 3 consecutive failures
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds timeout

// Performance metrics tracking
const performanceMetrics: {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalProcessingTime: number;
} = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  totalProcessingTime: 0,
};

async function postHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  performanceMetrics.totalRequests++;

  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Check circuit breaker
    if (circuitBreakerState.isOpen) {
      if (Date.now() < circuitBreakerState.resetTime) {
        console.log(`[circuit-breaker] Open - rejecting request for asset ${id}`);
        return NextResponse.json(
          {
            error: 'Service temporarily unavailable',
            retryAfter: Math.ceil((circuitBreakerState.resetTime - Date.now()) / 1000)
          },
          { status: 503 }
        );
      } else {
        // Reset circuit breaker after timeout
        console.log('[circuit-breaker] Resetting after timeout');
        circuitBreakerState.isOpen = false;
        circuitBreakerState.failureCount = 0;
      }
    }

    // Check for in-flight request (deduplication)
    const requestKey = `${userId}-${id}`;
    const existingRequest = inFlightRequests.get(requestKey);
    if (existingRequest) {
      console.log(`[dedup] Reusing in-flight request for asset ${id}`);
      const result = await existingRequest;
      return NextResponse.json(result);
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      include: {
        embedding: true,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Check if embedding already exists
    if (asset.embedding) {
      const processingTime = Date.now() - startTime;
      console.log(`[perf] Embedding already exists for asset ${id} (${processingTime}ms)`);
      return NextResponse.json({
        message: 'Embedding already exists',
        embedding: {
          modelName: asset.embedding.modelName,
          dimension: asset.embedding.dim,
          createdAt: asset.embedding.createdAt,
        },
      });
    }

    // Create a new promise for this embedding generation
    const embeddingPromise = (async () => {
      try {
        // Generate embedding
        let embeddingService;
        try {
          embeddingService = createEmbeddingService();
        } catch (error) {
          // Failed to initialize embedding service
          throw new Error('Embedding service not configured');
        }

        const apiStartTime = Date.now();
        const result = await embeddingService.embedImage(asset.blobUrl, asset.checksumSha256);
        const apiTime = Date.now() - apiStartTime;
        console.log(`[perf] Replicate API took ${apiTime}ms for asset ${id}`);

        // Store embedding in database
        const dbStartTime = Date.now();
        const embedding = await upsertAssetEmbedding({
          assetId: asset.id,
          modelName: result.model,
          modelVersion: result.model,
          dim: result.dimension,
          embedding: result.embedding,
        });
        const dbTime = Date.now() - dbStartTime;
        console.log(`[perf] Database write took ${dbTime}ms for asset ${id}`);

        if (!embedding) {
          throw new Error('Failed to persist embedding record');
        }

        // Success - reset circuit breaker failure count
        circuitBreakerState.failureCount = 0;
        performanceMetrics.successCount++;
        performanceMetrics.totalProcessingTime += (Date.now() - startTime);

        const avgProcessingTime = Math.round(performanceMetrics.totalProcessingTime / performanceMetrics.successCount);
        console.log(`[perf] Embedding generated successfully for asset ${id} (total: ${Date.now() - startTime}ms, avg: ${avgProcessingTime}ms)`);

        // Broadcast SSE update that embedding is ready
        try {
          await broadcastEmbeddingUpdate(
            userId,
            asset.id,
            {
              status: 'ready',
              modelName: embedding.modelName,
              hasEmbedding: true
            }
          );
          console.log(`[SSE] Broadcasted embedding ready for asset ${id}`);
        } catch (sseError) {
          // Don't fail the request if SSE broadcast fails
          console.error('[SSE] Failed to broadcast embedding update:', sseError);
        }

        return {
          success: true,
          message: 'Embedding generated successfully',
          embedding: {
            modelName: embedding.modelName,
            dimension: embedding.dim,
            processingTime: result.processingTime,
            createdAt: embedding.createdAt,
          },
        };
      } catch (error) {
        // Handle failure for circuit breaker
        circuitBreakerState.failureCount++;
        circuitBreakerState.lastFailureTime = Date.now();
        performanceMetrics.failureCount++;

        if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitBreakerState.isOpen = true;
          circuitBreakerState.resetTime = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
          console.error(`[circuit-breaker] Opening after ${circuitBreakerState.failureCount} consecutive failures`);
        }

        throw error;
      } finally {
        // Clean up in-flight request after a short delay
        setTimeout(() => {
          inFlightRequests.delete(requestKey);
        }, 100);
      }
    })();

    // Store the promise for deduplication
    inFlightRequests.set(requestKey, embeddingPromise);

    try {
      const result = await embeddingPromise;
      return NextResponse.json(result);
    } catch (error) {
      // Re-throw to be handled by outer catch
      throw error;
    }
  } catch (error) {
    unstable_rethrow(error);
    const processingTime = Date.now() - startTime;
    console.error(`[error] Failed to generate embedding for asset (${processingTime}ms):`, error);

    // Error generating embedding
    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    if ((error as Error).message === 'Embedding service not configured') {
      return NextResponse.json(
        {
          error: 'Embedding service not configured',
          details: 'Replicate API token not set. Please configure REPLICATE_API_TOKEN in your environment variables.'
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(postHandler, {
  operation: 'assets:generate-embedding',
});
