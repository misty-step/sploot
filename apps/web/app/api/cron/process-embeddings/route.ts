import { NextRequest, NextResponse } from 'next/server';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import {
  createEmbeddingService,
  type EmbeddingService,
} from '@/lib/embeddings';
import {
  EmbeddingError,
  embeddingOutcomeHeaders,
  embeddingRetryHeaders,
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderRateLimitError,
  EmbeddingProviderUnavailableError,
} from '@/lib/embedding-errors';
import { headers } from 'next/headers';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';
import { getRuntimeGate, runtimeGateError } from '@/lib/runtime-gates';
import {
  acquireEmbeddingProcessing,
  EMBEDDING_PROCESSING_TTL_MS,
  markEmbeddingTerminalSkipped,
} from '@/lib/embedding-guard';
import {
  deferEmbeddingAdmission,
  getEmbeddingAdmissionReason,
  getEmbeddingProviderCircuit,
  isGlobalEmbeddingAdmissionReason,
  isEmbeddingAdmissionFailure,
  recordEmbeddingAttemptFailure,
} from '@/lib/embedding-resilience';
import type { EmbeddingOutcome } from '@/lib/embedding-errors';
import { resolveEmbeddingMediaSource } from '@/lib/embedding-media';

// Hard per-run cap on embeddings generated — the bound on Replicate spend per
// invocation. With the */5 * * * * schedule this ceilings throughput at
// ~10/5min. The kill-switch for embedding spend is the `embeddings` runtime
// gate (checked below); flipping it off halts this cron. See ADR-008.
const EMBEDDINGS_BATCH_SIZE = 10;

// Performance tracking
interface ProcessingStats {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  deferredCount: number;
  totalProcessingTime: number;
  errors: Array<{
    assetId: string;
    error: string;
    taxonomy?: string;
    statusCode?: number;
    retryAfterSec?: number;
  }>;
}

type BatchOutcome = 'success' | 'no_work' | 'partial' | 'backoff';

/**
 * GET /api/cron/process-embeddings
 *
 * Cron job endpoint to process assets that need embeddings.
 * Can be triggered by the production scheduler or manually.
 *
 * Authorization: Uses Bearer token from CRON_SECRET environment variable
 */
async function getHandler(request: NextRequest) {
  const startTime = Date.now();
  const stats: ProcessingStats = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
    deferredCount: 0,
    totalProcessingTime: 0,
    errors: [],
  };
  let batchOutcome: BatchOutcome = 'success';
  let batchRetryAfterSec: number | undefined;
  let batchOutcomeReason: EmbeddingOutcome | undefined;

  try {
    // Verify cron authorization - required in all environments
    const authHeader = (await headers()).get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return NextResponse.json(
        {
          ...runtimeGateError(embeddingGate),
          stats,
        },
        { status: 503 }
      );
    }

    const providerCircuit = await getEmbeddingProviderCircuit();
    if (providerCircuit.open) {
      logger.logInfo('cron.process-embeddings.provider-backoff', {
        retryAfterSec: providerCircuit.retryAfterSec,
        reason: providerCircuit.reason,
        available: providerCircuit.available,
      });
      return NextResponse.json(
        {
          outcome: 'backoff' satisfies BatchOutcome,
          status: 'provider_backoff',
          message: providerCircuit.available
            ? 'Embedding provider backoff active'
            : 'Embedding provider backoff unavailable; failing closed',
          retryAfterSec: providerCircuit.retryAfterSec,
          stats,
        },
        {
          status: 503,
          headers: embeddingRetryHeaders(
            new EmbeddingProviderCircuitOpenError(providerCircuit.retryAfterSec),
          ),
        }
      );
    }

    // Rediscover retryable work and crashed workers. Terminal failed rows stay
    // excluded so a permanently bad asset cannot create a paid retry loop.
    const nowMs = Date.now();
    const oneHourAgo = new Date(nowMs - 60 * 60 * 1000);
    const processingStaleBefore = new Date(
      nowMs - EMBEDDING_PROCESSING_TTL_MS
    );

    const assetsNeedingEmbeddings = await prisma.asset.findMany({
      where: {
        deletedAt: null,
        createdAt: {
          lt: oneHourAgo,
        },
        OR: [
          { embedding: null },
          {
            embedding: {
              is: {
                status: 'pending',
                OR: [
                  { nextAttemptAt: null },
                  { nextAttemptAt: { lte: new Date(nowMs) } },
                ],
              },
            },
          },
          {
            embedding: {
              is: {
                status: 'processing',
                updatedAt: { lt: processingStaleBefore },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        blobUrl: true,
        mime: true,
        thumbnailUrl: true,
        checksumSha256: true,
        ownerUserId: true,
        createdAt: true,
      },
      take: EMBEDDINGS_BATCH_SIZE,
      orderBy: {
        createdAt: 'asc', // Process oldest first
      },
    });

    logger.logInfo('cron.process-embeddings.queue', {
      assets: assetsNeedingEmbeddings.length,
    });

    if (assetsNeedingEmbeddings.length === 0) {
      return NextResponse.json({
        outcome: 'no_work' satisfies BatchOutcome,
        status: 'idle',
        message: 'No assets need processing',
        stats,
      });
    }

    // Keep one service per owner so every paid call is charged to the user
    // whose asset is being processed. Admission remains enforced by the
    // provider service's existing Postgres leases and daily budget.
    const embeddingServices = new Map<string, EmbeddingService>();

    // Process each asset
    for (const asset of assetsNeedingEmbeddings) {
      const assetStartTime = Date.now();
      stats.totalProcessed++;

      try {
        logger.logInfo('cron.process-embeddings.asset-start', {
          assetId: asset.id,
          createdAt: asset.createdAt,
        });

        const media = resolveEmbeddingMediaSource({
          mime: asset.mime,
          blobUrl: asset.blobUrl,
          thumbnailUrl: asset.thumbnailUrl,
        });
        if (media.sourceKind === 'unsupported') {
          await markEmbeddingTerminalSkipped(
            asset.id,
            'Unsupported video without a poster thumbnail'
          );
          stats.skippedCount++;
          logger.logInfo('cron.process-embeddings.asset-skipped', {
            assetId: asset.id,
            reason: media.skipReason,
          });
          continue;
        }

        // Claim/create the durable row before any fallible service
        // initialization. Assets whose embedding is null therefore receive a
        // bounded retry/poison transition instead of being rediscovered
        // forever without state.
        const lock = await acquireEmbeddingProcessing(asset.id);
        if (!lock.acquired) {
          stats.skippedCount++;
          logger.logInfo('cron.process-embeddings.asset-skipped', {
            assetId: asset.id,
            state: lock.state,
            retryAfterMs: lock.retryAfterMs,
          });
          continue;
        }

        let embeddingService = embeddingServices.get(asset.ownerUserId);
        if (!embeddingService) {
          try {
            embeddingService = createEmbeddingService(asset.ownerUserId);
          } catch (error) {
            // Initialization is part of the durable attempt, not a preflight
            // escape hatch.  A malformed/missing runtime configuration must
            // therefore poison this claimed asset on the same bounded path as
            // an execution failure instead of leaving `processing` stranded.
            const providerError =
              error instanceof EmbeddingProviderCircuitOpenError ||
              error instanceof EmbeddingProviderRateLimitError ||
              error instanceof EmbeddingProviderUnavailableError
                ? error
                : new EmbeddingProviderUnavailableError(
                    'Embedding service initialization failed',
                  );
            const retryAfterSec = providerError.retryAfterSec ?? 30;
            const errorMessage = providerError.message;
            if (providerError instanceof EmbeddingProviderCircuitOpenError) {
              await deferEmbeddingAdmission(
                asset.id,
                errorMessage,
                'provider_circuit_open',
                retryAfterSec
              );
              stats.deferredCount++;
              stats.errors.push({
                assetId: asset.id,
                error: errorMessage,
                taxonomy: providerError.reason,
                statusCode: providerError.statusCode,
                retryAfterSec,
              });
              batchOutcome = 'backoff';
              batchRetryAfterSec = retryAfterSec;
              batchOutcomeReason = providerError.reason;
              logger.logInfo('cron.process-embeddings.initialization-deferred', {
                assetId: asset.id,
                reason: providerError.reason,
                retryAfterSec,
              });
              break;
            }
            const failure = await recordEmbeddingAttemptFailure(
              asset.id,
              errorMessage,
            );
            stats.failureCount++;
            stats.deferredCount++;
            stats.errors.push({
              assetId: asset.id,
              error: errorMessage,
              taxonomy: providerError.reason,
              statusCode: providerError.statusCode,
              retryAfterSec,
            });
            batchOutcomeReason = providerError.reason;
            logger.logInfo('cron.process-embeddings.initialization-failure-recorded', {
              assetId: asset.id,
              attemptCount: failure?.attemptCount,
              terminal: failure?.terminal,
              reason: providerError.reason,
            });
            batchOutcome = 'backoff';
            batchRetryAfterSec = retryAfterSec;
            if (!(error instanceof EmbeddingError)) {
              logger.logError(
                'cron:process-embeddings:service-init-failed',
                error as Error,
                { assetId: asset.id }
              );
            }
            break;
          }
          embeddingServices.set(asset.ownerUserId, embeddingService);
        }

        // Generate embedding
        const result = await embeddingService.embedImage(
          media.sourceUrl,
          asset.checksumSha256
        );

        // Store embedding in database
        const embedding = await upsertAssetEmbedding({
          assetId: asset.id,
          modelName: result.model,
          modelVersion: result.model,
          dim: result.dimension,
          embedding: result.embedding,
        });

        if (embedding) {
          stats.successCount++;
          const assetProcessingTime = Date.now() - assetStartTime;
          stats.totalProcessingTime += assetProcessingTime;
          logger.logInfo('cron.process-embeddings.asset-success', {
            assetId: asset.id,
            processingTimeMs: assetProcessingTime,
          });
        } else {
          throw new Error('Failed to persist embedding');
        }
      } catch (error) {
        stats.failureCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const taxonomy =
          error instanceof EmbeddingProviderCircuitOpenError
            ? error.reason
            : error instanceof EmbeddingProviderRateLimitError ||
                error instanceof EmbeddingProviderUnavailableError
              ? error.reason
              : isEmbeddingAdmissionFailure(error)
                ? getEmbeddingAdmissionReason(error)
                : error instanceof Error
                  ? error.name
                  : 'unknown';
        stats.errors.push({
          assetId: asset.id,
          error: errorMessage,
          taxonomy,
          statusCode:
            error instanceof Error && 'statusCode' in error
              ? (error as { statusCode?: number }).statusCode
              : undefined,
          retryAfterSec:
            error instanceof Error && 'retryAfterSec' in error
              ? (error as { retryAfterSec?: number }).retryAfterSec
              : undefined,
        });

        if (error instanceof EmbeddingProviderCircuitOpenError) {
          await deferEmbeddingAdmission(
            asset.id,
            errorMessage,
            'provider_circuit_open',
            error.retryAfterSec
          );
          stats.deferredCount++;
          batchOutcome = 'backoff';
          batchRetryAfterSec = error.retryAfterSec ?? 30;
          batchOutcomeReason = 'provider_circuit_open';
          break;
        }

        if (isEmbeddingAdmissionFailure(error)) {
          const retryAfterSec =
            typeof (error as { retryAfterSec?: unknown }).retryAfterSec === 'number'
              ? (error as { retryAfterSec: number }).retryAfterSec
              : undefined;
          const reason = getEmbeddingAdmissionReason(error) ?? 'limiter_unavailable';
          const isGlobalAdmission = isGlobalEmbeddingAdmissionReason(reason);
          await deferEmbeddingAdmission(
            asset.id,
            errorMessage,
            reason,
            retryAfterSec
          );
          stats.deferredCount++;
          logger.logInfo('cron.process-embeddings.admission-deferred', {
            assetId: asset.id,
            reason,
            retryAfterSec,
          });
          if (isGlobalAdmission) {
            // Only global/provider state is a batch decision. A per-user
            // window or concurrency lease must not halt unrelated users.
            batchOutcome = 'backoff';
            batchRetryAfterSec = retryAfterSec ?? 30;
            batchOutcomeReason = reason;
            break;
          }
          batchRetryAfterSec = Math.max(
            batchRetryAfterSec ?? 0,
            retryAfterSec ?? 30
          );
          batchOutcomeReason ??= reason;
          continue;
        }

        const failure = await recordEmbeddingAttemptFailure(
          asset.id,
          errorMessage
        );
        const typedProviderFailure =
          error instanceof EmbeddingProviderRateLimitError ||
          error instanceof EmbeddingProviderUnavailableError;
        if (typedProviderFailure) {
          logger.logInfo('cron.process-embeddings.provider-failure-recorded', {
            assetId: asset.id,
            attemptCount: failure?.attemptCount,
            terminal: failure?.terminal,
            reason: error.reason,
          });
        } else {
          logger.logError('cron:process-embeddings:asset-failed', error as Error, {
            assetId: asset.id,
            attemptCount: failure?.attemptCount,
            terminal: failure?.terminal,
          });
        }

        if (
          error instanceof EmbeddingProviderRateLimitError ||
          error instanceof EmbeddingProviderUnavailableError
        ) {
          batchOutcome = 'backoff';
          batchRetryAfterSec = error.retryAfterSec ?? 30;
          batchOutcomeReason = error.reason;
          break;
        }

        // Continue processing healthy assets even if one asset is poisoned.
        continue;
      }
    }

    const totalTime = Date.now() - startTime;
    const avgProcessingTime =
      stats.successCount > 0
        ? Math.round(stats.totalProcessingTime / stats.successCount)
        : 0;
    const successRate =
      stats.totalProcessed > 0
        ? Math.round((stats.successCount / stats.totalProcessed) * 100)
        : 0;

    logger.logInfo('cron.process-embeddings.complete', {
      totalTimeMs: totalTime,
      processed: stats.totalProcessed,
      successful: stats.successCount,
      failed: stats.failureCount,
      successRate,
      avgProcessingTimeMs: avgProcessingTime,
    });

    const outcome: BatchOutcome =
      batchOutcome === 'backoff'
        ? 'backoff'
        : stats.deferredCount > 0 || stats.failureCount > 0 || stats.skippedCount > 0
          ? 'partial'
          : 'success';
    const responseStatus = outcome === 'backoff' ? 503 : outcome === 'partial' ? 207 : 200;

    return NextResponse.json({
      outcome,
      status:
        outcome === 'backoff'
          ? 'provider_backoff'
          : outcome === 'partial'
            ? 'partial'
            : 'completed',
      retryAfterSec: batchRetryAfterSec,
      message:
        outcome === 'backoff'
          ? 'Embedding batch deferred by provider admission'
          : outcome === 'partial'
          ? 'Embedding batch completed with deferred or failed assets'
          : `Processed ${stats.totalProcessed} assets`,
      stats: {
        ...stats,
        totalTime,
        avgProcessingTime,
        successRate,
      },
    }, {
      status: responseStatus,
      headers: batchRetryAfterSec
        ? embeddingOutcomeHeaders(
            batchOutcomeReason ?? 'provider_unavailable',
            batchRetryAfterSec,
          )
        : undefined,
    });
  } catch (error) {
    if (error instanceof EmbeddingError) {
      const retryAfterSec = error.retryAfterSec;
      return NextResponse.json(
        {
          outcome: 'backoff' satisfies BatchOutcome,
          status: 'provider_backoff',
          error: error.message,
          taxonomy: 'reason' in error ? error.reason : 'embedding_error',
          retryAfterSec,
          stats,
        },
        {
          status: error.statusCode ?? 503,
          headers: embeddingRetryHeaders(error),
        }
      );
    }
    logger.logError('cron:process-embeddings:failed', error as Error);
    return NextResponse.json(
      {
        error: 'Failed to process embeddings',
        stats,
      },
      { status: 500 }
    );
  }
}

// GET only: the production scheduler invokes this on the */5 schedule, and a manual run is
// the same idempotent, CRON_SECRET-gated call. There is deliberately no POST
// variant — it would just duplicate GET and invite an "options" knob, and the
// only knob worth having (re-embed everything) is the runaway this route must
// never expose. See ADR-008.
export const GET = withObservability(getHandler, {
  operation: 'cron:process-embeddings',
});
