import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { verifyBearerOrThrow } from '@/lib/auth/verify-bearer';
import { blobConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { UploadValidationService } from '@/lib/upload/validation-service';
import { ImageProcessorService } from '@/lib/upload/image-processor-service';
import { DeduplicationService } from '@/lib/upload/deduplication-service';
import { BlobUploaderService } from '@/lib/upload/blob-uploader-service';
import { AssetRecorderService } from '@/lib/upload/asset-recorder-service';
import { EmbeddingSchedulerService } from '@/lib/upload/embedding-scheduler-service';
import { withObservability } from '@/lib/with-observability';

/**
 * Configure route segment options
 * maxDuration: Maximum execution time for the API route (60 seconds)
 * This prevents timeout errors for large file uploads
 */
export const maxDuration = 60;

/**
 * Direct file upload endpoint - handles file upload server-side
 *
 * Architecture: Thin orchestrator pattern
 * The route handler coordinates 6 specialized services:
 * 1. UploadValidationService - validates file type, size, and tags
 * 2. ImageProcessorService - processes uploaded images with retry logic
 * 3. DeduplicationService - checks for duplicate uploads via checksum
 * 4. BlobUploaderService - uploads to Vercel Blob with atomic cleanup
 * 5. AssetRecorderService - records asset in database with tag associations
 * 6. EmbeddingSchedulerService - schedules embedding generation (sync/async)
 *
 * CONCURRENCY HANDLING:
 * The upload flow handles race conditions via database unique constraint on (ownerUserId, checksumSha256).
 * When simultaneous uploads of identical files occur:
 * 1. Both requests upload blobs to storage
 * 2. First request succeeds in DB insert
 * 3. Second request catches P2002 (unique constraint violation)
 * 4. Second request cleans up its duplicate blobs via BlobUploaderService
 *
 * All business logic resides in services - this handler only orchestrates.
 */
async function postHandler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request parameters
    const url = new URL(req.url);
    const syncEmbeddings = url.searchParams.get('sync_embeddings') === 'true';

    // Authenticate user (supports both Bearer token and cookies)
    const userId = await verifyBearerOrThrow(req);

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const tagsData = formData.get('tags') as string | null;

    if (!file) {
      logger.info('Upload failed - no file provided', { userId, duration: Date.now() - startTime });
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Parse tags
    let tags: string[] = [];
    if (tagsData) {
      try {
        const parsed = JSON.parse(tagsData);
        tags = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        logger.warn('Failed to parse tags', { error: String(e) });
        tags = [];
      }
    }

    // Initialize services
    const validator = new UploadValidationService();
    const processor = new ImageProcessorService();
    const deduplicator = new DeduplicationService();
    const uploader = new BlobUploaderService();
    const recorder = new AssetRecorderService();
    const scheduler = new EmbeddingSchedulerService();

    // Step 1: Validate file
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const validationResult = validator.validateUpload(file, tags);
    if (!validationResult.valid) {
      const error = validationResult.error!;
      logger.warn('Upload validation failed', {
        userId,
        errorType: error.errorType,
        filename: file.name,
        size: file.size,
        type: file.type
      });

      return NextResponse.json(
        { success: false, error: error.userMessage },
        { status: error.statusCode }
      );
    }

    logger.info('File validated', {
      userId,
      filename: file.name,
      size: file.size,
      type: file.type,
      tags: tags.length
    });

    // Step 2: Process image
    const processingResult = await processor.processImage(fileBuffer, file.type);
    const processedImages = processingResult.processed;

    logger.debug('Image processed', {
      userId,
      hasProcessed: processingResult.success,
      hasThumbnail: !!processedImages?.thumbnail,
      usedFallback: processingResult.usedFallback
    });

    // Step 3: Check for duplicates
    const deduplicationResult = await deduplicator.checkDuplicate(userId, fileBuffer);

    if (deduplicationResult.isDuplicate && deduplicationResult.existingAsset) {
      logger.info('Duplicate upload detected', {
        userId,
        assetId: deduplicationResult.existingAsset.id,
        checksum: deduplicationResult.checksum,
        duration: Date.now() - startTime
      });

      // Schedule embedding if missing
      if (!deduplicationResult.existingAsset.hasEmbedding) {
        await scheduler.scheduleEmbedding({
          assetId: deduplicationResult.existingAsset.id,
          blobUrl: deduplicationResult.existingAsset.blobUrl,
          checksum: deduplicationResult.checksum,
          mode: syncEmbeddings ? 'sync' : 'async',
        });
      }

      return NextResponse.json(
        {
          success: true,
          isDuplicate: true,
          asset: {
            id: deduplicationResult.existingAsset.id,
            blobUrl: deduplicationResult.existingAsset.blobUrl,
            pathname: deduplicationResult.existingAsset.pathname,
            filename: file.name,
            mimeType: deduplicationResult.existingAsset.mime,
            size: deduplicationResult.existingAsset.size,
            checksum: deduplicationResult.checksum,
            createdAt: deduplicationResult.existingAsset.createdAt,
            needsEmbedding: !deduplicationResult.existingAsset.hasEmbedding,
          },
          message: 'This image already exists in your library',
        },
        { status: 409 }
      );
    }

    // Step 4: Upload to blob storage
    const uploadResult = await uploader.upload(
      userId,
      file.name,
      fileBuffer,
      processedImages
    );

    logger.info('Blobs uploaded', {
      userId,
      mainUrl: uploadResult.mainUrl,
      hasThumbnail: !!uploadResult.thumbnailUrl
    });

    // Step 5: Record asset in database
    try {
      const recordResult = await recorder.recordAsset(
        {
          ownerUserId: userId,
          blobUrl: uploadResult.mainUrl,
          thumbnailUrl: uploadResult.thumbnailUrl,
          pathname: uploadResult.mainPathname,
          thumbnailPath: uploadResult.thumbnailPathname,
          mime: file.type,
          width: processedImages?.main.width ?? null,
          height: processedImages?.main.height ?? null,
          size: file.size,
          checksumSha256: deduplicationResult.checksum,
        },
        tags
      );

      logger.info('Asset recorded', {
        userId,
        assetId: recordResult.asset.id,
        tagsCreated: recordResult.tagsCreated,
        tagsAssociated: recordResult.tagsAssociated,
        duration: Date.now() - startTime
      });

      // Step 6: Schedule embedding generation
      await scheduler.scheduleEmbedding({
        assetId: recordResult.asset.id,
        blobUrl: uploadResult.mainUrl,
        checksum: deduplicationResult.checksum,
        mode: syncEmbeddings ? 'sync' : 'async',
      });

      return NextResponse.json(
        {
          success: true,
          isDuplicate: false,
          asset: {
            id: recordResult.asset.id,
            blobUrl: uploadResult.mainUrl,
            pathname: uploadResult.mainPathname,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            checksum: deduplicationResult.checksum,
            createdAt: recordResult.asset.createdAt,
            needsEmbedding: true,
          },
          message: 'Upload successful',
        },
        { status: 201 }
      );
    } catch (dbError) {
      // Database error - cleanup uploaded blobs
      logger.error('Database error, cleaning up blobs', {
        userId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });

      try {
        await uploader.cleanup(uploadResult.mainUrl, uploadResult.thumbnailUrl);
      } catch (cleanupError) {
        // Log but don't throw - blob may already be deleted in race condition
        logger.warn('Blob cleanup failed (may already be deleted)', {
          userId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      // Check if it was a duplicate constraint violation (race condition)
      if (dbError instanceof Error && dbError.message.includes('Unique constraint')) {
        logger.info('Race condition detected, checking for existing asset', { userId });

        // Re-check for existing asset after race condition
        const recheckResult = await deduplicator.checkDuplicate(userId, fileBuffer);
        const existingAsset = recheckResult.existingAsset;

        if (existingAsset) {
          return NextResponse.json(
            {
              success: true,
              isDuplicate: true,
              asset: {
                id: existingAsset.id,
                blobUrl: existingAsset.blobUrl,
                pathname: existingAsset.pathname,
                filename: file.name,
                mimeType: existingAsset.mime,
                size: existingAsset.size,
                checksum: existingAsset.checksumSha256,
                createdAt: existingAsset.createdAt,
                needsEmbedding: !existingAsset.hasEmbedding,
              },
              message: 'This image already exists in your library',
            },
            { status: 409 }
          );
        }
      }

      throw dbError;
    }
  } catch (error) {
    unstable_rethrow(error);

    logger.error('Upload endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration: Date.now() - startTime,
    });

    // Return generic error to client, full details logged server-side only
    return NextResponse.json(
      {
        error: 'Upload failed',
        // Only include error details in development for debugging
        details: process.env.NODE_ENV === 'development'
          ? (error instanceof Error ? error.message : String(error))
          : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for checking upload service status
 */
async function getHandler(req: NextRequest) {
  try {
    await verifyBearerOrThrow(req);
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'ready',
    blobConfigured,
    limits: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    },
  });
}

export const POST = withObservability(postHandler, { operation: 'upload:direct' });

export const GET = withObservability(getHandler, {
  operation: 'upload:status',
  skipTiming: true,
});
