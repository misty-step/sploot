import { logger } from '@/lib/logger';
import { UploadValidationService } from '@/lib/upload/validation-service';
import { ImageProcessorService } from '@/lib/upload/image-processor-service';
import { DeduplicationService } from '@/lib/upload/deduplication-service';
import { BlobUploaderService } from '@/lib/upload/blob-uploader-service';
import { AssetRecorderService } from '@/lib/upload/asset-recorder-service';
import { EmbeddingSchedulerService } from '@/lib/upload/embedding-scheduler-service';
import { PerceptualHashService } from '@/lib/upload/perceptual-hash-service';
import {
  releaseStorageQuotaReservation,
  reserveUploadBytes,
} from '@/lib/quota/storage-quota-policy';
import type { IngestedAssetSource } from '@/lib/types';

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

export type IngestedAsset = IngestedAssetSource;

export type IngestImageResult =
  | { kind: 'invalid'; error: { userMessage: string; statusCode: number } }
  | { kind: 'duplicate'; asset: IngestedAsset }
  | { kind: 'created'; asset: IngestedAsset };

export interface IngestImageOptions {
  userId: string;
  file: File;
  tags?: string[];
  syncEmbeddings?: boolean;
  /**
   * Set false when the caller writes a precomputed vector itself (e.g. the
   * starter-pile seed): skips embedding scheduling entirely so no Replicate
   * call, rate-limit lease, or daily-budget slot is spent on the asset.
   */
  scheduleEmbeddings?: boolean;
}

export async function ingestImage({
  userId,
  file,
  tags = [],
  syncEmbeddings = false,
  scheduleEmbeddings = true,
}: IngestImageOptions): Promise<IngestImageResult> {
  const startTime = Date.now();
  let quotaReservationId: string | null = null;

  const validator = new UploadValidationService();
  const processor = new ImageProcessorService();
  const deduplicator = new DeduplicationService();
  const perceptualHasher = new PerceptualHashService();
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

    if (scheduleEmbeddings && !deduplicationResult.existingAsset.hasEmbedding) {
      await scheduler.scheduleEmbedding({
        assetId: deduplicationResult.existingAsset.id,
        blobUrl: deduplicationResult.existingAsset.blobUrl,
        checksum: deduplicationResult.checksum,
        mode: syncEmbeddings ? 'sync' : 'async',
        ownerUserId: userId,
      });
    }

    return {
      kind: 'duplicate',
      asset: {
        id: deduplicationResult.existingAsset.id,
        blobUrl: deduplicationResult.existingAsset.blobUrl,
        thumbnailUrl: deduplicationResult.existingAsset.thumbnailUrl,
        pathname: deduplicationResult.existingAsset.pathname,
        filename: file.name,
        mime: deduplicationResult.existingAsset.mime,
        mimeType: deduplicationResult.existingAsset.mime,
        size: deduplicationResult.existingAsset.size,
        width: deduplicationResult.existingAsset.width,
        height: deduplicationResult.existingAsset.height,
        favorite: deduplicationResult.existingAsset.favorite,
        checksum: deduplicationResult.checksum,
        phash: null,
        nearDuplicate: null,
        createdAt: deduplicationResult.existingAsset.createdAt,
        needsEmbedding: !deduplicationResult.existingAsset.hasEmbedding,
      },
    };
  }

  // Step 3: Compute perceptual hash and look for visually-near duplicates.
  // This is advisory: exact checksum duplicates block, near-duplicates warn.
  const perceptualResult = await perceptualHasher.inspect(userId, fileBuffer);

  try {
    // Step 4: Reserve quota before image processing and Blob writes.
    const quotaReservation = await reserveUploadBytes(userId, file.size);
    quotaReservationId = quotaReservation.id;

    // Step 5: Process image
    const processingResult = await processor.processImage(fileBuffer, file.type);
    const processedImages = processingResult.processed;

    logger.debug('Image processed', {
      userId,
      hasProcessed: processingResult.success,
      hasThumbnail: !!processedImages?.thumbnail,
      usedFallback: processingResult.usedFallback,
    });

    // Step 6: Upload to blob storage
    const uploadResult = await uploader.upload(userId, file.name, fileBuffer, processedImages);

    logger.info('Blobs uploaded', {
      userId,
      mainUrl: uploadResult.mainUrl,
      hasThumbnail: !!uploadResult.thumbnailUrl,
    });

    // Step 7: Record asset in database
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
          phash: perceptualResult.phash,
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

      // Step 8: Schedule embedding generation
      if (scheduleEmbeddings) {
        await scheduler.scheduleEmbedding({
          assetId: recordResult.asset.id,
          blobUrl: uploadResult.thumbnailUrl ?? uploadResult.mainUrl,
          checksum: deduplicationResult.checksum,
          mode: syncEmbeddings ? 'sync' : 'async',
          ownerUserId: userId,
        });
      }

      return {
        kind: 'created',
        asset: {
          id: recordResult.asset.id,
          blobUrl: uploadResult.mainUrl,
          thumbnailUrl: uploadResult.thumbnailUrl,
          pathname: uploadResult.mainPathname,
          filename: file.name,
          mime: file.type,
          mimeType: file.type,
          size: file.size,
          width: recordResult.asset.width,
          height: recordResult.asset.height,
          favorite: recordResult.asset.favorite,
          checksum: deduplicationResult.checksum,
          phash: perceptualResult.phash,
          nearDuplicate: perceptualResult.nearDuplicate,
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
              thumbnailUrl: existingAsset.thumbnailUrl,
              pathname: existingAsset.pathname,
              filename: file.name,
              mime: existingAsset.mime,
              mimeType: existingAsset.mime,
              size: existingAsset.size,
              width: existingAsset.width,
              height: existingAsset.height,
              favorite: existingAsset.favorite,
              checksum: existingAsset.checksumSha256,
              phash: null,
              nearDuplicate: null,
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
