import { logger } from '@/lib/logger';
import { UploadValidationService } from '@/lib/upload/validation-service';
import { ImageProcessorService } from '@/lib/upload/image-processor-service';
import { DeduplicationService } from '@/lib/upload/deduplication-service';
import { BlobUploaderService } from '@/lib/upload/blob-uploader-service';
import { AssetRecorderService } from '@/lib/upload/asset-recorder-service';
import { EmbeddingSchedulerService } from '@/lib/upload/embedding-scheduler-service';
import { PerceptualHashService, type NearDuplicateAsset } from '@/lib/upload/perceptual-hash-service';
import {
  releaseStorageQuotaReservation,
  reserveUploadBytes,
} from '@/lib/quota/storage-quota-policy';
import { prisma } from '@/lib/db';
import { assertEnrolledUser } from '@/lib/enrollment/enrollment-policy';

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
  thumbnailUrl?: string | null;
  pathname: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
  phash?: string | null;
  nearDuplicate?: NearDuplicateAsset | null;
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
  /**
   * Set false when the caller writes a precomputed vector itself (e.g. the
   * starter-pile seed): skips embedding scheduling entirely so no Replicate
   * call, rate-limit lease, or daily attempt-ceiling slot is spent on the asset.
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
  // This is the shared server-owned boundary for every ingestion surface.
  // It runs before image processing, Blob writes, or embedding scheduling.
  await assertEnrolledUser(userId, prisma);

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
        mime: deduplicationResult.existingAsset.mime,
        thumbnailUrl: deduplicationResult.existingAsset.thumbnailUrl ?? null,
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
        thumbnailUrl: deduplicationResult.existingAsset.thumbnailUrl ?? null,
        pathname: deduplicationResult.existingAsset.pathname,
        filename: file.name,
        mimeType: deduplicationResult.existingAsset.mime,
        size: deduplicationResult.existingAsset.size,
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
    const uploadResult = await uploader.upload(userId, file.name, fileBuffer, processedImages, file.type);

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
          storageProvider: uploadResult.storageProvider,
          storageConfigFingerprint: uploadResult.storageConfigFingerprint,
          storageKey: uploadResult.storageKey,
          thumbnailStorageKey: uploadResult.thumbnailStorageKey,
          storageSize: uploadResult.mainSize,
          storageSha256: uploadResult.mainSha256,
          thumbnailStorageSize: uploadResult.thumbnailSize,
          thumbnailStorageSha256: uploadResult.thumbnailSha256,
          storageReplicas: [
            ...uploadResult.mainReplicas.map((replica) => ({ ...replica, rendition: 'original' as const })),
            ...uploadResult.thumbnailReplicas.map((replica) => ({ ...replica, rendition: 'thumbnail' as const })),
          ],
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
          mime: file.type,
          thumbnailUrl: uploadResult.thumbnailUrl,
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
          mimeType: file.type,
          size: file.size,
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
        await uploader.cleanup(uploadResult.mainUrl, uploadResult.thumbnailUrl, uploadResult.mainReplicas, uploadResult.thumbnailReplicas);
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
              thumbnailUrl: existingAsset.thumbnailUrl ?? null,
              pathname: existingAsset.pathname,
              filename: file.name,
              mimeType: existingAsset.mime,
              size: existingAsset.size,
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
