import { after } from 'next/server';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import {
  createEmbeddingService,
  EmbeddingAdmissionError,
  EmbeddingError,
} from '@/lib/embeddings';
import {
  acquireEmbeddingProcessing,
  resolveEmbeddingGateState,
} from '@/lib/embedding-guard';
import { getRuntimeGate } from '@/lib/runtime-gates';
import { logger } from '@/lib/logger';

/**
 * Embedding scheduling error
 */
export class EmbeddingScheduleError extends Error {
  constructor(
    message: string,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = 'EmbeddingScheduleError';
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
  reason?: 'embeddings_disabled';
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
    const { assetId, blobUrl, checksum, mode, ownerUserId } = params;

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

    if (mode === 'sync') {
      // Synchronous mode: generate embedding immediately
      try {
        await this.generateEmbedding(assetId, blobUrl, checksum, ownerUserId);
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
          await this.generateEmbedding(assetId, blobUrl, checksum, ownerUserId);
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
    ownerUserId: string
  ): Promise<void> {
    logger.debug('Starting embedding generation', { assetId });

    // Skip if database not available
    if (!prisma) {
      logger.warn('Database not available, skipping embedding generation', {
        assetId,
      });
      return;
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
        return;
      }
      if (gateState.state === 'processing') {
        logger.info('Embedding already processing, skipping generation', {
          assetId,
        });
        return;
      }
      if (gateState.state === 'cooldown') {
        logger.info('Embedding in cooldown, skipping generation', {
          assetId,
          retryAfterMs: gateState.retryAfterMs,
        });
        return;
      }
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
      return;
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

      // Mark as failed in database
      await this.markEmbeddingFailed(
        assetId,
        'Failed to initialize embedding service'
      );
      throw new EmbeddingScheduleError(
        'Failed to initialize embedding service',
        false,
        error instanceof Error ? error : undefined
      );
    }

    // Generate image embedding
    try {
      logger.debug('Calling embedding service', { assetId });
      const result = await embeddingService.embedImage(blobUrl, checksum);

      // Store embedding in database
      await upsertAssetEmbedding({
        assetId,
        modelName: result.model,
        modelVersion: result.model,
        dim: result.dimension,
        embedding: result.embedding,
      });

      logger.info('Embedding stored successfully', {
        assetId,
        model: result.model,
        dimension: result.dimension,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

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
        await this.markEmbeddingPending(assetId, errorMessage);
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

      // Mark as failed in database
      await this.markEmbeddingFailed(assetId, errorMessage);

      // Re-throw for sync mode error handling
      throw new EmbeddingScheduleError(
        `Embedding generation failed: ${errorMessage}`,
        error instanceof EmbeddingError ? error.retryable : false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /** Keep an acquired placeholder eligible for cron or explicit retry. */
  private async markEmbeddingPending(
    assetId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      if (!prisma) {
        logger.warn('Database not available, cannot defer embedding', {
          assetId,
        });
        return;
      }

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
        update: {
          status: 'pending',
          error: errorMessage,
        },
      });

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
    errorMessage: string
  ): Promise<void> {
    try {
      if (!prisma) {
        logger.warn('Database not available, cannot mark embedding as failed', {
          assetId,
        });
        return;
      }

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
        update: {
          status: 'failed',
          error: errorMessage,
        },
      });

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
