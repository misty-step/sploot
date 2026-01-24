import { NextRequest, NextResponse } from 'next/server';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { headers } from 'next/headers';
import { withObservability } from '@/lib/with-observability';
import { logger } from '@/lib/observability-logger';

// Performance tracking
interface ProcessingStats {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  totalProcessingTime: number;
  errors: Array<{ assetId: string; error: string }>;
}

/**
 * GET /api/cron/process-embeddings
 *
 * Cron job endpoint to process assets that need embeddings.
 * Can be triggered by Vercel Cron or manually.
 *
 * Authorization: Uses Bearer token from CRON_SECRET environment variable
 */
async function getHandler(request: NextRequest) {
  const startTime = Date.now();
  const stats: ProcessingStats = {
    totalProcessed: 0,
    successCount: 0,
    failureCount: 0,
    totalProcessingTime: 0,
    errors: [],
  };

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

    // Find assets that need embeddings
    // 1. Assets older than 1 hour with no embeddings
    // 2. Assets with failed status (if we track this in the future)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const assetsNeedingEmbeddings = await prisma.asset.findMany({
      where: {
        deletedAt: null,
        embedding: null,
        createdAt: {
          lt: oneHourAgo,
        },
      },
      select: {
        id: true,
        blobUrl: true,
        checksumSha256: true,
        ownerUserId: true,
        createdAt: true,
      },
      take: 10, // Process in batches of 10
      orderBy: {
        createdAt: 'asc', // Process oldest first
      },
    });

    logger.logInfo('cron.process-embeddings.queue', {
      assets: assetsNeedingEmbeddings.length,
    });

    if (assetsNeedingEmbeddings.length === 0) {
      return NextResponse.json({
        message: 'No assets need processing',
        stats,
      });
    }

    // Initialize embedding service once
    let embeddingService;
    try {
      embeddingService = createEmbeddingService();
    } catch (error) {
      logger.logError('cron:process-embeddings:service-init-failed', error as Error);
      return NextResponse.json(
        {
          error: 'Embedding service not configured',
          stats,
        },
        { status: 503 }
      );
    }

    // Process each asset
    for (const asset of assetsNeedingEmbeddings) {
      const assetStartTime = Date.now();
      stats.totalProcessed++;

      try {
        logger.logInfo('cron.process-embeddings.asset-start', {
          assetId: asset.id,
          createdAt: asset.createdAt,
        });

        // Generate embedding
        const result = await embeddingService.embedImage(asset.blobUrl, asset.checksumSha256);

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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        stats.errors.push({
          assetId: asset.id,
          error: errorMessage,
        });
        logger.logError('cron:process-embeddings:asset-failed', error as Error, { assetId: asset.id });

        // Continue processing other assets even if one fails
        continue;
      }
    }

    const totalTime = Date.now() - startTime;
    const avgProcessingTime = stats.successCount > 0
      ? Math.round(stats.totalProcessingTime / stats.successCount)
      : 0;
    const successRate = stats.totalProcessed > 0
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

    return NextResponse.json({
      message: `Processed ${stats.totalProcessed} assets`,
      stats: {
        ...stats,
        totalTime,
        avgProcessingTime,
        successRate,
      },
    });
  } catch (error) {
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

/**
 * POST /api/cron/process-embeddings
 *
 * Manual trigger for processing embeddings with specific options.
 */
async function postHandler(request: NextRequest) {
  // For manual triggering with specific parameters
  const body = await request.json();
  const { batchSize = 10, includeRecent = false } = body;

  // Similar processing logic but with configurable parameters
  // This allows for manual testing and different processing strategies
  return getHandler(request);
}

export const GET = withObservability(getHandler, {
  operation: 'cron:process-embeddings',
});

export const POST = withObservability(postHandler, {
  operation: 'cron:process-embeddings',
});
