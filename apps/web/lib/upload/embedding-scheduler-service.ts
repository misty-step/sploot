import { after } from 'next/server';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
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
}

/**
 * Result of embedding scheduling operation
 */
export interface EmbeddingScheduleResult {
  scheduled: boolean;
  mode: EmbeddingScheduleMode;
  assetId: string;
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
    const { assetId, blobUrl, checksum, mode } = params;

    logger.info('Scheduling embedding generation', {
      assetId,
      mode,
      blobUrl: blobUrl.substring(0, 50) + '...',
    });

    if (mode === 'sync') {
      // Synchronous mode: generate embedding immediately
      try {
        await this.generateEmbedding(assetId, blobUrl, checksum);
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
          await this.generateEmbedding(assetId, blobUrl, checksum);
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
   * Updates status to 'failed' if errors occur
   */
  private async generateEmbedding(
    assetId: string,
    blobUrl: string,
    checksum: string
  ): Promise<void> {
    logger.debug('Starting embedding generation', { assetId });

    // Skip if database not available
    if (!prisma) {
      logger.warn('Database not available, skipping embedding generation', { assetId });
      return;
    }

    // Check if embedding already exists
    const existingEmbedding = await prisma.assetEmbedding.findUnique({
      where: { assetId },
    });

    if (existingEmbedding) {
      logger.info('Embedding already exists, skipping generation', { assetId });
      return;
    }

    // Initialize embedding service
    let embeddingService;
    try {
      embeddingService = createEmbeddingService();
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
      // Log error and update status
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
      // Don't throw - this is cleanup, best effort
    }
  }
}
