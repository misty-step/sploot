import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getAuth } from '@/lib/auth/server';
import { acquireEmbeddingProcessing, markEmbeddingFailed, resolveEmbeddingGateState } from '@/lib/embedding-guard';
import { acquireEmbeddingRateLimit, releaseEmbeddingRateLimit } from '@/lib/embedding-rate-limit';
import type { EmbeddingRateLimitLease } from '@/lib/embedding-rate-limit';
import { broadcastEmbeddingUpdate } from '@/lib/sse-broadcaster';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';

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

interface EmbeddingResponse {
  status: number;
  body: Record<string, any>;
  headers?: HeadersInit;
}

async function postHandler(
  req: NextRequest,
  context: RouteContext
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

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
    }

    // Check circuit breaker
    if (circuitBreakerState.isOpen) {
      if (Date.now() < circuitBreakerState.resetTime) {
        logger.logInfo('generate-embedding.circuit-open', { assetId: id });
        return NextResponse.json(
          {
            error: 'Service temporarily unavailable',
            retryAfter: Math.ceil((circuitBreakerState.resetTime - Date.now()) / 1000)
          },
          { status: 503 }
        );
      } else {
        // Reset circuit breaker after timeout
        logger.logInfo('generate-embedding.circuit-reset');
        circuitBreakerState.isOpen = false;
        circuitBreakerState.failureCount = 0;
      }
    }

    // Check for in-flight request (deduplication)
    const requestKey = `${userId}-${id}`;
    const existingRequest = inFlightRequests.get(requestKey);
    if (existingRequest) {
      logger.logInfo('generate-embedding.dedup-hit', { assetId: id });
      const result = await existingRequest;
      return NextResponse.json(result.body, {
        status: result.status,
        headers: result.headers,
      });
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
        embedding: {
          select: {
            modelName: true,
            dim: true,
            createdAt: true,
            status: true,
            updatedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const gateState = resolveEmbeddingGateState(asset.embedding);
    if (gateState.state === 'ready') {
      const processingTime = Date.now() - startTime;
      logger.logInfo('generate-embedding.already-exists', {
        assetId: id,
        processingTimeMs: processingTime,
      });
      return NextResponse.json({
        success: true,
        status: 'ready',
        alreadyExists: true,
        message: 'Embedding already exists',
        embedding: asset.embedding
          ? {
            modelName: asset.embedding.modelName,
            dimension: asset.embedding.dim,
            createdAt: asset.embedding.createdAt,
          }
          : undefined,
      });
    }

    if (gateState.state === 'processing') {
      const retryAfterSec = gateState.retryAfterMs ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000)) : undefined;
      logger.logInfo('generate-embedding.already-processing', {
        assetId: id,
        retryAfterSec,
      });
      return NextResponse.json(
        {
          success: true,
          status: 'processing',
          message: 'Embedding already processing',
          retryAfter: retryAfterSec,
        },
        {
          status: 202,
          headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined,
        }
      );
    }

    if (gateState.state === 'cooldown') {
      const retryAfterSec = gateState.retryAfterMs ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000)) : undefined;
      logger.logInfo('generate-embedding.cooldown', {
        assetId: id,
        retryAfterSec,
      });
      return NextResponse.json(
        {
          success: false,
          status: 'cooldown',
          error: 'Embedding recently failed, retry later',
          retryAfter: retryAfterSec,
        },
        {
          status: 429,
          headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined,
        }
      );
    }

    // Create a new promise for this embedding generation
    const embeddingPromise = (async (): Promise<EmbeddingResponse> => {
      let rateLimitLease: EmbeddingRateLimitLease | null = null;

      try {
        const rateLimit = await acquireEmbeddingRateLimit(userId);
        if (!rateLimit.allowed) {
          const retryAfterSec = rateLimit.retryAfterSec;
          logger.logInfo('generate-embedding.rate-limited', {
            assetId: id,
            reason: rateLimit.reason,
            retryAfterSec,
            counts: rateLimit.counts,
          });

          const statusCode = rateLimit.reason === 'kv_unavailable' ? 503 : 429;
          return {
            status: statusCode,
            headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined,
            body: {
              success: false,
              status: 'rate_limited',
              error: rateLimit.reason === 'kv_unavailable'
                ? 'Embedding rate limiter unavailable'
                : 'Rate limit exceeded',
              reason: rateLimit.reason,
              retryAfter: retryAfterSec,
            },
          };
        }

        rateLimitLease = rateLimit.lease ?? null;

        const lock = await acquireEmbeddingProcessing(asset.id);
        if (!lock.acquired) {
          await releaseEmbeddingRateLimit(rateLimitLease);
          rateLimitLease = null;

          const retryAfterSec = lock.retryAfterMs ? Math.max(1, Math.ceil(lock.retryAfterMs / 1000)) : undefined;

          if (lock.state === 'ready') {
            const latestEmbedding = prisma
              ? await prisma.assetEmbedding.findUnique({
                  where: { assetId: asset.id },
                  select: {
                    modelName: true,
                    dim: true,
                    createdAt: true,
                  },
                })
              : null;
            const readyEmbedding = latestEmbedding ?? asset.embedding;
            return {
              status: 200,
              body: {
                success: true,
                status: 'ready',
                alreadyExists: true,
                message: 'Embedding already exists',
                embedding: readyEmbedding
                  ? {
                      modelName: readyEmbedding.modelName,
                      dimension: readyEmbedding.dim,
                      createdAt: readyEmbedding.createdAt,
                    }
                  : undefined,
              },
            };
          }

          if (lock.state === 'processing') {
            return {
              status: 202,
              headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined,
              body: {
                success: true,
                status: 'processing',
                message: 'Embedding already processing',
                retryAfter: retryAfterSec,
              },
            };
          }

          if (lock.state === 'cooldown') {
            return {
              status: 429,
              headers: retryAfterSec ? { 'Retry-After': retryAfterSec.toString() } : undefined,
              body: {
                success: false,
                status: 'cooldown',
                error: 'Embedding recently failed, retry later',
                retryAfter: retryAfterSec,
              },
            };
          }

          return {
            status: 503,
            body: {
              success: false,
              error: 'Embedding lock unavailable',
            },
          };
        }

        logger.logInfo('generate-embedding.lock-acquired', { assetId: id });

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
        logger.logInfo('generate-embedding.api-duration', {
          assetId: id,
          durationMs: apiTime,
        });

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
        logger.logInfo('generate-embedding.db-duration', {
          assetId: id,
          durationMs: dbTime,
        });

        if (!embedding) {
          throw new Error('Failed to persist embedding record');
        }

        // Success - reset circuit breaker failure count
        circuitBreakerState.failureCount = 0;
        performanceMetrics.successCount++;
        const totalProcessingTime = Date.now() - startTime;
        performanceMetrics.totalProcessingTime += totalProcessingTime;

        const avgProcessingTime = Math.round(performanceMetrics.totalProcessingTime / performanceMetrics.successCount);
        logger.logInfo('generate-embedding.success', {
          assetId: id,
          totalTimeMs: totalProcessingTime,
          avgProcessingTimeMs: avgProcessingTime,
        });

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
          logger.logInfo('generate-embedding.sse-broadcast', {
            assetId: id,
          });
        } catch (sseError) {
          // Don't fail the request if SSE broadcast fails
          logger.logError('generate-embedding:sse-broadcast-failed', sseError as Error, { assetId: id });
        }

        return {
          status: 200,
          body: {
            success: true,
            message: 'Embedding generated successfully',
            embedding: {
              modelName: embedding.modelName,
              dimension: embedding.dim,
              processingTime: result.processingTime,
              createdAt: embedding.createdAt,
            },
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        try {
          await markEmbeddingFailed(asset.id, errorMessage);
        } catch (markError) {
          logger.logError('generate-embedding:mark-failed', markError, { assetId: id });
        }

        // Handle failure for circuit breaker
        const isRateLimitError = error instanceof EmbeddingError && error.statusCode === 429;
        if (!isRateLimitError) {
          circuitBreakerState.failureCount++;
          circuitBreakerState.lastFailureTime = Date.now();
          performanceMetrics.failureCount++;

          if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreakerState.isOpen = true;
            circuitBreakerState.resetTime = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            logger.logError(
              'generate-embedding.circuit-open',
              error instanceof Error ? error : new Error(String(error)),
              { assetId: id, failureCount: circuitBreakerState.failureCount }
            );
          }
        }

        throw error;
      } finally {
        await releaseEmbeddingRateLimit(rateLimitLease);
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
      return NextResponse.json(result.body, {
        status: result.status,
        headers: result.headers,
      });
    } catch (error) {
      // Re-throw to be handled by outer catch
      throw error;
    }
  } catch (error) {
    unstable_rethrow(error);
    const processingTime = Date.now() - startTime;
    logger.logError('generate-embedding:failed', error as Error, { processingTimeMs: processingTime });

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
