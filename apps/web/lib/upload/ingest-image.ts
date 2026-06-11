import { logger } from '@/lib/logger';
import { UploadValidationService } from '@/lib/upload/validation-service';
import { ImageProcessorService } from '@/lib/upload/image-processor-service';
import { DeduplicationService } from '@/lib/upload/deduplication-service';
import { BlobUploaderService } from '@/lib/upload/blob-uploader-service';
import { AssetRecorderService } from '@/lib/upload/asset-recorder-service';
import { EmbeddingSchedulerService } from '@/lib/upload/embedding-scheduler-service';
import {
  releaseStorageQuotaReservation,
  reserveUploadBytes,
} from '@/lib/quota/storage-quota-policy';

/**
 * Shared server-side image ingestion pipeline.
 *
 * One file in, one asset out: validate → dedupe → reserve quota → process →
 * upload blobs → record → schedule embedding. Used by every ingestion
 * surface (direct upload API, PWA share-target, URL import, bulk import) so
 * dedupe, quota, and cleanup semantics cannot drift between them.
 *
 * Storage quota violations propagate as StorageQuotaExceededError; callers
 * map them to their own response shape. All other failures throw.
 */

export interface IngestedAsset {
  id: string;
  blobUrl: string;
  pathname: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: Date | string;
  needsEmbedding: boolean;
}

export type IngestImageResult =
  | { kind: 'invalid'; error: { userMessage: string; statusCode: number } }
  | { kind: 'duplicate'; asset: IngestedAsset }
  | { kind: 'created'; asset: IngestedAsset };

export interface IngestImageOptions {
  userId: string;
  file: File;
  tags?: string[];
  syncEmbeddings?: boolean;
}

export async function ingestImage({
  userId,
  file,
  tags = [],
  syncEmbeddings = false,
}: IngestImageOptions): Promise<IngestImageResult> {
  const startTime = Date.now();
  let quotaReservationId: string | null = null;

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
      type: file.type,
    });

    return {
      kind: 'invalid',
      error: { userMessage: error.userMessage, statusCode: error.statusCode },
    };
  }

  logger.info('File validated', {
    userId,
    filename: file.name,
    size: file.size,
    type: file.type,
    tags: tags.length,
  });

  // Step 2: Check for duplicates before reserving storage.
  const deduplicationResult = await deduplicator.checkDuplicate(userId, fileBuffer);

  if (deduplicationResult.isDuplicate && deduplicationResult.existingAsset) {
    logger.info('Duplicate upload detected', {
      userId,
      assetId: deduplicationResult.existingAsset.id,
      checksum: deduplicationResult.checksum,
      duration: Date.now() - startTime,
    });

    if (!deduplicationResult.existingAsset.hasEmbedding) {
      await scheduler.scheduleEmbedding({
        assetId: deduplicationResult.existingAsset.id,
        blobUrl: deduplicationResult.existingAsset.blobUrl,
        checksum: deduplicationResult.checksum,
        mode: syncEmbeddings ? 'sync' : 'async',
      });
    }

    return {
      kind: 'duplicate',
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
    };
  }

  try {
    // Step 3: Reserve quota before image processing and Blob writes.
    const quotaReservation = await reserveUploadBytes(userId, file.size);
    quotaReservationId = quotaReservation.id;

    // Step 4: Process image
    const processingResult = await processor.processImage(fileBuffer, file.type);
    const processedImages = processingResult.processed;

    logger.debug('Image processed', {
      userId,
      hasProcessed: processingResult.success,
      hasThumbnail: !!processedImages?.thumbnail,
      usedFallback: processingResult.usedFallback,
    });

    // Step 5: Upload to blob storage
    const uploadResult = await uploader.upload(userId, file.name, fileBuffer, processedImages);

    logger.info('Blobs uploaded', {
      userId,
      mainUrl: uploadResult.mainUrl,
      hasThumbnail: !!uploadResult.thumbnailUrl,
    });

    // Step 6: Record asset in database
    try {
      const recordResult = await recorder.recordAsset(
        {
          ownerUserId: userId,
          blobUrl: uploadResult.mainUrl,
          thumbnailUrl: uploadResult.thumbnailUrl,
          pathname: uploadResult.mainPathname,
          thumbnailPath: uploadResult.thumbnailPathname,
          mime: file.type,
          width: processingResult.metadata?.width ?? processedImages?.main?.width ?? null,
          height: processingResult.metadata?.height ?? processedImages?.main?.height ?? null,
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
        duration: Date.now() - startTime,
      });

      await releaseStorageQuotaReservation(quotaReservationId);
      quotaReservationId = null;

      // Step 7: Schedule embedding generation
      await scheduler.scheduleEmbedding({
        assetId: recordResult.asset.id,
        blobUrl: uploadResult.thumbnailUrl ?? uploadResult.mainUrl,
        checksum: deduplicationResult.checksum,
        mode: syncEmbeddings ? 'sync' : 'async',
      });

      return {
        kind: 'created',
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
      };
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

        const recheckResult = await deduplicator.checkDuplicate(userId, fileBuffer);
        const existingAsset = recheckResult.existingAsset;

        if (existingAsset) {
          await releaseStorageQuotaReservation(quotaReservationId);
          quotaReservationId = null;

          return {
            kind: 'duplicate',
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
          };
        }
      }

      throw dbError;
    }
  } catch (error) {
    await releaseStorageQuotaReservation(quotaReservationId);
    throw error;
  }
}
