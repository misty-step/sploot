import { after } from 'next/server';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import {
  createEmbeddingService,
  EmbeddingAdmissionError,
  EmbeddingError,
} from '@/lib/embeddings';
import {
  EmbeddingProviderCircuitOpenError,
  EmbeddingProviderUnavailableError,
} from '@/lib/embedding-errors';
import {
  acquireEmbeddingProcessing,
  markEmbeddingTerminalSkipped,
  resolveEmbeddingGateState,
} from '@/lib/embedding-guard';
import {
  resolveEmbeddingMediaSource,
  type EmbeddingMediaSkipReason,
} from '@/lib/embedding-media';
import {
  deferEmbeddingAdmission,
  type EmbeddingAttemptFailure,
  type EmbeddingAdmissionReason,
  getEmbeddingAdmissionReason,
  isEmbeddingAdmissionFailure,
  recordEmbeddingAttemptFailure,
} from '@/lib/embedding-resilience';
import { getRuntimeGate } from '@/lib/runtime-gates';
import { logger } from '@/lib/logger';

/**
 * Embedding scheduling error
 */
export class EmbeddingScheduleError extends EmbeddingError {
  readonly reason?: string;

  constructor(
    message: string,
    public retryable: boolean = false,
    public cause?: Error,
    statusCode?: number,
    retryAfterSec?: number,
  ) {
    super(
      message,
      statusCode ?? (cause instanceof EmbeddingError ? cause.statusCode : 500),
      retryable,
      retryAfterSec ?? (cause instanceof EmbeddingError ? cause.retryAfterSec : undefined),
    );
    this.name = 'EmbeddingScheduleError';
    this.reason = (cause as { reason?: string } | undefined)?.reason;
  }
}

/**
 * Scheduling mode for embedding generation
 */
export type EmbeddingScheduleMode = 'sync' | 'async';

/**
 * Parameters for scheduling embedding generation
 */
export interface EmbeddingScheduleParams {
  assetId: string;
  blobUrl: string;
  mime: string;
  thumbnailUrl?: string | null;
  checksum: string;
  mode: EmbeddingScheduleMode;
  /** Asset owner, for the per-user embedding rate limit lease. */
  ownerUserId: string;
}

/**
 * Result of embedding scheduling operation
 */
export interface EmbeddingScheduleResult {
  scheduled: boolean;
  mode: EmbeddingScheduleMode;
  assetId: string;
  reason?: 'embeddings_disabled' | EmbeddingMediaSkipReason;
}

/**
 * Service for scheduling embedding generation in sync or async modes.
 * Deep module: simple scheduleEmbedding interface hides Next.js after() API complexity.
 *
 * Interface: scheduleEmbedding(params) -> Promise<EmbeddingScheduleResult>
 * Hidden: Next.js after() API, embedding service initialization, error handling, status updates
 *
 * Key design:
 * - Sync mode: Generate embedding immediately, block response until complete
 * - Async mode: Use Next.js after() to generate after response sent (faster UX)
 * - Both modes handle errors gracefully with database status updates
 */
export class EmbeddingSchedulerService {
  /**
   * Schedule embedding generation for an asset
   *
   * @param params - Scheduling parameters (assetId, blobUrl, checksum, mode)
   * @returns Promise resolving to scheduling result
   * @throws EmbeddingScheduleError for sync mode failures (async mode logs but doesn't throw)
   */
  async scheduleEmbedding(
    params: EmbeddingScheduleParams
  ): Promise<EmbeddingScheduleResult> {
    const { assetId, blobUrl, checksum, mode, ownerUserId, mime, thumbnailUrl } = params;
    const media = resolveEmbeddingMediaSource({
      mime,
      blobUrl,
      thumbnailUrl,
    });

    logger.info('Scheduling embedding generation', {
      assetId,
      mode,
      blobUrl: blobUrl.substring(0, 50) + '...',
    });

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      logger.warn('Embedding generation skipped by runtime gate', {
        assetId,
        gate: embeddingGate.code,
      });
      return { scheduled: false, mode, assetId, reason: 'embeddings_disabled' };
    }

    if (media.sourceKind === 'unsupported') {
      await markEmbeddingTerminalSkipped(
        assetId,
        'Unsupported video without a poster thumbnail'
      );
      logger.warn('Embedding generation terminal-skipped', {
        assetId,
        reason: media.skipReason,
      });
      return { scheduled: false, mode, assetId, reason: media.skipReason };
    }

    if (mode === 'sync') {
      // Synchronous mode: generate embedding immediately
      try {
        const generated = await this.generateEmbedding(
          assetId,
          blobUrl,
          checksum,
          ownerUserId,
          mime,
          thumbnailUrl
        );
        if (!generated) {
          return { scheduled: false, mode: 'sync', assetId, reason: media.skipReason };
        }
        logger.info('Embedding generated synchronously', { assetId });
        return { scheduled: true, mode: 'sync', assetId };
      } catch (error) {
        logger.error('Sync embedding generation failed', {
          assetId,
          error: error instanceof Error ? error.message : String(error),
        });
        // If already an EmbeddingScheduleError, just re-throw to preserve details
        if (error instanceof EmbeddingScheduleError) {
          throw error;
        }
        // Otherwise wrap in new error
        throw new EmbeddingScheduleError(
          `Failed to generate embedding synchronously for asset ${assetId}`,
          false,
          error instanceof Error ? error : undefined
        );
      }
    } else {
      // Asynchronous mode: schedule with Next.js after()
      after(async () => {
        try {
          await this.generateEmbedding(
            assetId,
            blobUrl,
            checksum,
            ownerUserId,
            mime,
            thumbnailUrl
          );
          logger.info('Embedding generated asynchronously', { assetId });
        } catch (error) {
          logger.error('Async embedding generation failed', {
            assetId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Error already handled in generateEmbedding (status updated in DB)
          // Don't throw - this is background processing
        }
      });

      logger.info('Embedding scheduled asynchronously', { assetId });
      return { scheduled: true, mode: 'async', assetId };
    }
  }

  /**
   * Generate embedding for an asset (internal implementation)
   * Handles embedding service initialization, generation, and database storage
   * Leaves admission-denied work pending for recovery; other failures are terminal.
   */
  private async generateEmbedding(
    assetId: string,
    blobUrl: string,
    checksum: string,
    ownerUserId: string,
    mime: string,
    thumbnailUrl?: string | null
  ): Promise<boolean> {
    logger.debug('Starting embedding generation', { assetId });

    // Skip if database not available
    if (!prisma) {
      logger.warn('Database not available, skipping embedding generation', {
        assetId,
      });
      return false;
    }

    // Check if embedding already exists
    const existingEmbedding = await prisma.assetEmbedding.findUnique({
      where: { assetId },
    });

    if (existingEmbedding) {
      const gateState = resolveEmbeddingGateState(existingEmbedding);
      if (gateState.state === 'ready') {
        logger.info('Embedding already exists, skipping generation', {
          assetId,
        });
        return true;
      }
      if (gateState.state === 'processing') {
        logger.info('Embedding already processing, skipping generation', {
          assetId,
        });
        return true;
      }
      if (gateState.state === 'cooldown') {
        logger.info('Embedding in cooldown, skipping generation', {
          assetId,
          retryAfterMs: gateState.retryAfterMs,
        });
        return true;
      }
    }

    const media = resolveEmbeddingMediaSource({
      mime,
      blobUrl,
      thumbnailUrl,
    });
    if (media.sourceKind === 'unsupported') {
      await markEmbeddingTerminalSkipped(
        assetId,
        'Unsupported video without a poster thumbnail'
      );
      logger.warn('Embedding generation terminal-skipped', {
        assetId,
        reason: media.skipReason,
      });
      return false;
    }

    // The provider service owns the durable concurrency/rate/daily admission
    // boundary. No consumer can reach Replicate without passing that gate.
    const lock = await acquireEmbeddingProcessing(assetId);
    if (!lock.acquired) {
      logger.info('Embedding lock not acquired, skipping generation', {
        assetId,
        state: lock.state,
        retryAfterMs: lock.retryAfterMs,
      });
      return true;
    }

    // Initialize embedding service
    let embeddingService;
    try {
      embeddingService = createEmbeddingService(ownerUserId);
    } catch (error) {
      logger.error('Failed to initialize embedding service', {
        assetId,
        error: error instanceof Error ? error.message : String(error),
      });

      const providerError = error instanceof EmbeddingProviderUnavailableError
        ? error
        : new EmbeddingProviderUnavailableError(
            'Embedding service initialization failed',
          );
      const failure = await this.recordAttemptFailureOrFallback(
        assetId,
        providerError.message,
        true,
        lock.processingClaimToken,
      );
      const terminal = failure?.terminal ?? false;
      throw new EmbeddingScheduleError(
        `Embedding generation deferred: ${providerError.message}`,
        !terminal,
        providerError,
      );
    }

    // Generate image embedding
    try {
      logger.debug('Calling embedding service', { assetId });
      const result = await embeddingService.embedImage(media.sourceUrl, checksum);

      // Store embedding in database
      await upsertAssetEmbedding({
        assetId,
        modelName: result.model,
        modelVersion: result.model,
        dim: result.dimension,
        embedding: result.embedding,
      }, lock.processingClaimToken);

      logger.info('Embedding stored successfully', {
        assetId,
        model: result.model,
        dimension: result.dimension,
      });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof EmbeddingProviderCircuitOpenError) {
        await this.deferAdmissionOrFallback(
          assetId,
          errorMessage,
          'provider_circuit_open',
          error.retryAfterSec,
          lock.processingClaimToken,
        );
        throw new EmbeddingScheduleError(
          `Embedding generation deferred: ${errorMessage}`,
          true,
          error
        );
      }

      if (isEmbeddingAdmissionFailure(error)) {
        const retryAfterSec =
          error instanceof EmbeddingAdmissionError
            ? error.retryAfterSec
            : undefined;
        const reason = getEmbeddingAdmissionReason(error) ?? 'limiter_unavailable';
        await this.deferAdmissionOrFallback(
          assetId,
          errorMessage,
          reason,
          retryAfterSec,
          lock.processingClaimToken,
        );
        throw new EmbeddingScheduleError(
          `Embedding generation deferred: ${errorMessage}`,
          true,
          error instanceof Error ? error : undefined
        );
      }

      if (error instanceof EmbeddingError && error.retryable) {
        logger.warn('Embedding generation deferred for retry', {
          assetId,
          reason:
            error instanceof EmbeddingAdmissionError
              ? error.reason
              : 'provider_retryable',
          retryAfterSec:
            error instanceof EmbeddingAdmissionError
              ? error.retryAfterSec
              : undefined,
        });
        await this.recordAttemptFailureOrFallback(
          assetId,
          errorMessage,
          true,
          lock.processingClaimToken,
        );
        throw new EmbeddingScheduleError(
          `Embedding generation deferred: ${errorMessage}`,
          true,
          error
        );
      }

      if (error instanceof EmbeddingError) {
        logger.error('Embedding generation failed', {
          assetId,
          error: errorMessage,
          retryable: error.retryable,
        });
      } else {
        logger.error('Unexpected error generating embedding', {
          assetId,
          error: errorMessage,
        });
      }

      // Keep non-retryable assets bounded too. The durable attempt counter is
      // the poison oracle; the legacy failed write is only a compatibility
      // fallback for clients that predate the resilience migration.
      await this.recordAttemptFailureOrFallback(
        assetId,
        errorMessage,
        false,
        lock.processingClaimToken,
      );

      // Re-throw for sync mode error handling
      throw new EmbeddingScheduleError(
        `Embedding generation failed: ${errorMessage}`,
        error instanceof EmbeddingError ? error.retryable : false,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async recordAttemptFailureOrFallback(
    assetId: string,
    errorMessage: string,
    pendingFallback: boolean,
    expectedProcessingClaimToken?: string,
  ): Promise<EmbeddingAttemptFailure | null> {
    if (prisma && typeof prisma.$queryRaw === 'function') {
      return recordEmbeddingAttemptFailure(
        assetId,
        errorMessage,
        expectedProcessingClaimToken,
      );
    }

    if (pendingFallback) {
      await this.markEmbeddingPending(
        assetId,
        errorMessage,
        expectedProcessingClaimToken,
      );
    } else {
      await this.markEmbeddingFailed(
        assetId,
        errorMessage,
        expectedProcessingClaimToken,
      );
    }
    return null;
  }

  private async deferAdmissionOrFallback(
    assetId: string,
    errorMessage: string,
    reason: EmbeddingAdmissionReason | 'provider_circuit_open',
    retryAfterSec?: number,
    expectedProcessingClaimToken?: string,
  ): Promise<void> {
    try {
      await deferEmbeddingAdmission(
        assetId,
        errorMessage,
        reason,
        retryAfterSec,
        expectedProcessingClaimToken,
      );
      return;
    } catch (deferError) {
      logger.error('Failed to defer admission-denied embedding', {
        assetId,
        error:
          deferError instanceof Error ? deferError.message : String(deferError),
      });
    }

    // Compatibility fallback is reserved for a failed durable deferral. A
    // successful migration-backed update must not be followed by a redundant
    // legacy write that can race or erase retry metadata.
    await this.markEmbeddingPending(
      assetId,
      errorMessage,
      expectedProcessingClaimToken,
    );
  }

  /** Keep an acquired placeholder eligible for cron or explicit retry. */
  private async markEmbeddingPending(
    assetId: string,
    errorMessage: string,
    expectedProcessingClaimToken?: string,
  ): Promise<void> {
    try {
      if (!prisma) {
        logger.warn('Database not available, cannot defer embedding', {
          assetId,
        });
        return;
      }

      if (expectedProcessingClaimToken) {
        await prisma.assetEmbedding.updateMany({
          where: {
            assetId,
            status: 'processing',
            processingClaimToken: expectedProcessingClaimToken,
          },
          data: {
            status: 'pending',
            error: errorMessage,
            processingClaimToken: null,
          },
        });
      } else {
        await prisma.assetEmbedding.upsert({
          where: { assetId },
          create: {
            assetId,
            modelName: 'pending',
            modelVersion: 'pending',
            dim: 0,
            status: 'pending',
            error: errorMessage,
          },
          update: { status: 'pending', error: errorMessage },
        });
      }

      logger.debug('Deferred embedding for retry', { assetId });
    } catch (updateError) {
      logger.error('Failed to defer embedding for retry', {
        assetId,
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
      });
    }
  }

  /**
   * Mark embedding as failed in database
   * Creates or updates assetEmbedding record with failed status
   */
  private async markEmbeddingFailed(
    assetId: string,
    errorMessage: string,
    expectedProcessingClaimToken?: string,
  ): Promise<void> {
    try {
      if (!prisma) {
        logger.warn('Database not available, cannot mark embedding as failed', {
          assetId,
        });
        return;
      }

      if (expectedProcessingClaimToken) {
        await prisma.assetEmbedding.updateMany({
          where: {
            assetId,
            status: 'processing',
            processingClaimToken: expectedProcessingClaimToken,
          },
          data: {
            status: 'failed',
            error: errorMessage,
            processingClaimToken: null,
          },
        });
      } else {
        await prisma.assetEmbedding.upsert({
          where: { assetId },
          create: {
            assetId,
            modelName: 'unknown',
            modelVersion: 'unknown',
            dim: 0,
            status: 'failed',
            error: errorMessage,
          },
          update: { status: 'failed', error: errorMessage },
        });
      }

      logger.debug('Marked embedding as failed', { assetId });
    } catch (updateError) {
      logger.error('Failed to update embedding status', {
        assetId,
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
      });
      // Don't throw - this is cleanup, best effort
    }
  }
}
