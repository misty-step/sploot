import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import {
  createEmbeddingService,
  EmbeddingAdmissionError,
  EmbeddingError,
} from '@/lib/embeddings';
import { CostAdmissionError, costAdmissionErrorResponse } from '@/lib/cost';
import {
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  embeddingRetryAfterHeader,
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
  EmbeddingConfigurationError,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
import {
  acquireEmbeddingProcessing,
  markEmbeddingFailed,
  markEmbeddingTerminalSkipped,
  resolveEmbeddingGateState,
} from '@/lib/embedding-guard';
import {
  deferEmbeddingAdmission,
  recordEmbeddingConfigurationFailure,
  getEmbeddingAdmissionReason,
  getEmbeddingProviderCircuit,
  isEmbeddingAdmissionFailure,
  recordEmbeddingAttemptFailure,
  reviveTerminalEmbedding,
} from '@/lib/embedding-resilience';
import { broadcastEmbeddingUpdate } from '@/lib/sse-broadcaster';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';
import { resolveEmbeddingMediaSource } from '@/lib/embedding-media';

// Request deduplication: Track in-flight requests
const inFlightRequests = new Map<string, Promise<any>>();

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

async function postHandler(req: NextRequest, context: RouteContext, { principal }: AuthenticatedApiContext) {
  const startTime = Date.now();
  performanceMetrics.totalRequests++;

  try {
    const userId = principal.userId;

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Admission must precede circuit checks and in-flight deduplication so a
    // denied caller can never observe or join another user's work.
    await assertEnrolledUser(userId, prisma);
    if (!prisma) return enrollmentUnavailableResponse();

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
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

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        blobUrl: true,
        checksumSha256: true,
        mime: true,
        thumbnailUrl: true,
        embedding: {
          select: {
            modelName: true,
            dim: true,
            createdAt: true,
            status: true,
            updatedAt: true,
            completedAt: true,
            nextAttemptAt: true,
            terminalAt: true,
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
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
      const retryAfterSec = gateState.retryAfterMs
        ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000))
        : undefined;
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
          headers: retryAfterSec
            ? { 'Retry-After': retryAfterSec.toString() }
            : undefined,
        }
      );
    }

    if (gateState.state === 'cooldown') {
      const retryAfterSec = gateState.retryAfterMs
        ? Math.max(1, Math.ceil(gateState.retryAfterMs / 1000))
        : undefined;
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
          headers: embeddingRetryAfterHeader(retryAfterSec),
        }
      );
    }

    const media = resolveEmbeddingMediaSource({
      mime: asset.mime,
      blobUrl: asset.blobUrl,
      thumbnailUrl: asset.thumbnailUrl,
    });
    if (media.sourceKind === 'unsupported') {
      const lock = await acquireEmbeddingProcessing(asset.id);
      if (lock.acquired) {
        const processingClaimToken = lock.processingClaimToken;
        try {
          await markEmbeddingTerminalSkipped(
            asset.id,
            'Unsupported video without a poster thumbnail',
            processingClaimToken,
          );
        } catch (error) {
          // Terminal settlement is a claim-owned write. If it fails after the
          // claim is acquired, release that exact claim as ordinary failure
          // handling would, so unsupported media cannot strand processing.
          await markEmbeddingFailed(
            asset.id,
            error instanceof Error ? error.message : String(error),
            processingClaimToken,
          );
          throw error;
        }
      }
      logger.logInfo('generate-embedding.terminal-skip', {
        assetId: id,
        reason: media.skipReason,
      });
      return NextResponse.json(
        {
          success: false,
          status: 'terminal_skip',
          error: 'Unsupported video without a poster thumbnail',
          reason: media.skipReason,
        },
        {
          status: 422,
        }
      );
    }

    // Terminal rows stay excluded from cron discovery and the claim
    // predicate; this owner-authorized request is their one recovery path.
    // A quarantine-expired revive re-arms the bounded attempt budget and then
    // proceeds through the ordinary circuit/lease/admission boundary below.
    let revivedFromTerminal = false;
    if (gateState.state === 'terminal') {
      const revive = await reviveTerminalEmbedding(asset.id);
      if (!revive.revived && revive.reason === 'quarantine') {
        logger.logInfo('generate-embedding.terminal-quarantine', {
          assetId: id,
          retryAfterSec: revive.retryAfterSec,
        });
        return NextResponse.json(
          {
            success: false,
            status: 'terminal_quarantine',
            error: 'Embedding retries exhausted recently, retry later',
            retryAfter: revive.retryAfterSec,
          },
          {
            status: 429,
            headers: embeddingRetryAfterHeader(revive.retryAfterSec),
          }
        );
      }
      if (!revive.revived && revive.reason === 'revival_exhausted') {
        logger.logInfo('generate-embedding.terminal-revival-exhausted', {
          assetId: id,
          reviveCount: revive.reviveCount,
        });
        return NextResponse.json(
          {
            success: false,
            status: 'terminal_failure',
            reason: 'revival_exhausted',
            error: 'Embedding recovery attempts exhausted for this asset',
          },
          { status: 422 }
        );
      }
      if (!revive.revived) {
        // 'not_terminal' means we lost a race with a concurrent revive or the
        // row changed; the claim below arbitrates the current state.
        // 'store_unavailable' also falls through and fails closed at the lock.
        logger.logInfo('generate-embedding.terminal-revive-skipped', {
          assetId: id,
          reason: revive.reason,
        });
      } else {
        revivedFromTerminal = true;
      }
    }

    // Create a new promise for this embedding generation
    const embeddingPromise = (async (): Promise<EmbeddingResponse> => {
      let processingClaimToken: string | undefined;
      let providerInitializationDeferred = false;
      try {
        const lock = await acquireEmbeddingProcessing(asset.id);
        if (!lock.acquired) {
          const retryAfterSec = lock.retryAfterMs
            ? Math.max(1, Math.ceil(lock.retryAfterMs / 1000))
            : undefined;

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
              headers: retryAfterSec
                ? { 'Retry-After': retryAfterSec.toString() }
                : undefined,
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
              headers: embeddingRetryAfterHeader(retryAfterSec),
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
        processingClaimToken = lock.processingClaimToken;

        logger.logInfo('generate-embedding.lock-acquired', { assetId: id });

        // Read provider state only after all no-work outcomes and the durable
        // asset claim have been resolved. A circuit outage must not hide a
        // ready, processing, cooldown, or unsupported-media response.
        const providerCircuit = await getEmbeddingProviderCircuit();
        if (providerCircuit.open) {
          throw new EmbeddingProviderCircuitOpenError(providerCircuit.retryAfterSec);
        }

        // Client construction happens before any provider attempt. Missing
        // configuration is therefore deferred without consuming the asset's
        // retry budget; failures from embedImage remain real provider
        // attempts and are handled by the ordinary failure path below.
        let embeddingService;
        try {
          embeddingService = createEmbeddingService(userId);
        } catch (error) {
          if (error instanceof EmbeddingConfigurationError) {
            providerInitializationDeferred = true;
            await reportEmbeddingConfigurationErrorOnce(error, 'generate-embedding:configuration');
            await recordEmbeddingConfigurationFailure(
              asset.id,
              error,
              processingClaimToken,
            );
          }
          throw error;
        }

        const apiStartTime = Date.now();
        const result = await embeddingService.embedImage(
          media.sourceUrl,
          asset.checksumSha256
        );
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
        }, processingClaimToken);
        const dbTime = Date.now() - dbStartTime;
        logger.logInfo('generate-embedding.db-duration', {
          assetId: id,
          durationMs: dbTime,
        });

        if (!embedding) {
          throw new Error('Failed to persist embedding record');
        }

        performanceMetrics.successCount++;
        const totalProcessingTime = Date.now() - startTime;
        performanceMetrics.totalProcessingTime += totalProcessingTime;

        const avgProcessingTime = Math.round(
          performanceMetrics.totalProcessingTime /
            performanceMetrics.successCount
        );
        logger.logInfo('generate-embedding.success', {
          assetId: id,
          totalTimeMs: totalProcessingTime,
          avgProcessingTimeMs: avgProcessingTime,
        });

        // Broadcast SSE update that embedding is ready
        try {
          await broadcastEmbeddingUpdate(userId, asset.id, {
            status: 'ready',
            modelName: embedding.modelName,
            hasEmbedding: true,
          });
          logger.logInfo('generate-embedding.sse-broadcast', {
            assetId: id,
          });
        } catch (sseError) {
          // Don't fail the request if SSE broadcast fails
          logger.logError(
            'generate-embedding:sse-broadcast-failed',
            sseError as Error,
            { assetId: id }
          );
        }

        return {
          status: 200,
          body: {
            success: true,
            message: 'Embedding generated successfully',
            ...(revivedFromTerminal ? { revived: true } : {}),
            embedding: {
              modelName: embedding.modelName,
              dimension: embedding.dim,
              processingTime: result.processingTime,
              createdAt: embedding.createdAt,
            },
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        performanceMetrics.failureCount++;

        if (error instanceof EmbeddingProviderCircuitOpenError) {
          await deferEmbeddingAdmission(
            asset.id,
            errorMessage,
            'provider_circuit_open',
            error.retryAfterSec,
            processingClaimToken,
          );
        } else if (isEmbeddingAdmissionFailure(error)) {
          await deferEmbeddingAdmission(
            asset.id,
            errorMessage,
            getEmbeddingAdmissionReason(error) ?? 'limiter_unavailable',
            error.retryAfterSec,
            processingClaimToken,
          );
        } else if (
          !providerInitializationDeferred &&
          processingClaimToken &&
          prisma &&
          typeof prisma.$queryRaw === 'function'
        ) {
          await recordEmbeddingAttemptFailure(
            asset.id,
            errorMessage,
            processingClaimToken,
          );
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

    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // EmbeddingAdmissionError(limiter_unavailable) carries the shared
    // enrollment_unavailable code but keeps its typed 503 + Retry-After
    // contract below; only genuine enrollment failures take this path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingAdmissionError)) {
      return enrollmentUnavailableResponse();
    }
    const processingTime = Date.now() - startTime;
    const isTypedEmbeddingOutcome =
      error instanceof EmbeddingAdmissionError ||
      error instanceof EmbeddingProviderCircuitOpenError ||
      error instanceof EmbeddingProviderRateLimitError ||
      error instanceof EmbeddingProviderUnavailableError ||
      error instanceof EmbeddingConfigurationError;
    if (isTypedEmbeddingOutcome) {
      logger.logInfo('generate-embedding:typed-failure', {
        processingTimeMs: processingTime,
        statusCode: error.statusCode,
        reason: 'reason' in error ? error.reason : undefined,
      });
    } else if (error instanceof EmbeddingError && (error.statusCode ?? 0) >= 500) {
      logger.logError('generate-embedding:failed', error, {
        processingTimeMs: processingTime,
      });
    } else {
      // The route owns generic error capture and marks the response so the
      // request boundary does not emit the same failure.
      logger.logError('generate-embedding:failed', error as Error, {
        processingTimeMs: processingTime,
      });
    }

    if (error instanceof CostAdmissionError) {
      const response = costAdmissionErrorResponse(error);
      const body = await response.clone().json();
      return NextResponse.json(
        {
          ...body,
          success: false,
          status: 'cost_admission_denied',
          retryAfter: error.retryAfterSec,
        },
        { status: response.status, headers: response.headers },
      );
    }

    // Error generating embedding
    if (
      error instanceof EmbeddingProviderCircuitOpenError ||
      error instanceof EmbeddingProviderRateLimitError ||
      error instanceof EmbeddingProviderUnavailableError
      || error instanceof EmbeddingConfigurationError
    ) {
      const retryAfterSec = error.retryAfterSec;
      return NextResponse.json(
        {
          success: false,
          status: error instanceof EmbeddingProviderCircuitOpenError
            ? 'provider_backoff'
            : error instanceof EmbeddingProviderRateLimitError
              ? 'provider_rate_limited'
              : 'provider_unavailable',
          error: error.message,
          reason: error.reason,
          retryAfter: retryAfterSec,
        },
        {
          status: error.statusCode || 503,
          headers: error instanceof EmbeddingConfigurationError
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    if (error instanceof EmbeddingAdmissionError) {
      const retryAfterSec = error.retryAfterSec;
      return NextResponse.json(
        {
          success: false,
          status: 'rate_limited',
          error: error.message,
          reason: error.reason,
          ...(error.code ? { code: error.code } : {}),
          retryAfter: retryAfterSec,
        },
        {
          status: error.statusCode || 503,
          headers: embeddingRetryHeaders(error),
        }
      );
    }

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.statusCode || 500,
        }
      );
    }

    if ((error as Error).message === 'Embedding service not configured') {
      return NextResponse.json(
        {
          error: 'Embedding service not configured',
          details:
            'Replicate API token not set. Please configure REPLICATE_API_TOKEN in your environment variables.',
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

export const POST = withObservability(withAuthenticatedApi(postHandler), {
  operation: 'assets:generate-embedding',
});
