import { prisma } from '@/lib/db';
import { TAG, isValidTagName } from '@sploot/common';
import type { StorageReplica } from '@/lib/storage/object-store';
import { logger } from '@/lib/logger';
import { Prisma, type Asset } from '@prisma/client';
import {
  acquireEnrollmentIdentityWriterLock,
  EnrollmentUnavailableError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';

/**
 * Asset recording error
 */
export class AssetRecordError extends Error {
  constructor(
    message: string,
    public retryable: boolean = false,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AssetRecordError';
  }
}

/**
 * Metadata for creating an asset record
 */
export interface AssetMetadata {
  ownerUserId: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  thumbnailPath: string | null;
  storageProvider?: string;
  storageKey?: string | null;
  thumbnailStorageKey?: string | null;
  storageConfigFingerprint?: string | null;
  storageSize?: number | null;
  storageSha256?: string | null;
  thumbnailStorageSize?: number | null;
  thumbnailStorageSha256?: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  checksumSha256: string;
  phash?: string | null;
  storageReplicas?: Array<StorageReplica & { rendition: 'original' | 'thumbnail'; size: number; sha256: string; contentType?: string; active?: boolean; generation?: number }>;
  /**
   * When set, delete this storage quota reservation in the same transaction
   * that inserts the asset + replica rows so concurrent meters never see both
   * physical bytes and the reservation for the same upload.
   */
  releaseQuotaReservationId?: string | null;
}

/**
 * Result of asset recording operation
 */
export interface AssetRecordResult {
  asset: Asset;
  tagsCreated: number;
  tagsAssociated: number;
}

/**
 * Service for recording assets in database with tag associations.
 * Deep module: simple recordAsset interface hides Prisma transactions, tag batching, N+1 prevention.
 *
 * Interface: recordAsset(metadata, tags) -> Asset
 * Hidden: Prisma transaction API, tag deduplication, batch queries, association creation
 *
 * Key design: Fixes N+1 query problem by batching tag operations.
 * Old approach: N queries for N tags (findFirst + create + createAssociation per tag)
 * New approach: 3 queries total (1 findMany, 1 createMany, 1 createMany) regardless of tag count
 */
export class AssetRecorderService {
  /**
   * Record asset in database with tag associations
   * Atomic transaction: asset + all tags succeed or all rolled back
   */
  async recordAsset(
    metadata: AssetMetadata,
    tags: string[] = []
  ): Promise<AssetRecordResult> {
    if (!prisma) {
      throw new EnrollmentUnavailableError();
    }

    // Sanitize and deduplicate tags
    const uniqueTags = this.sanitizeTags(tags);

    logger.debug('Recording asset with tags', {
      userId: metadata.ownerUserId,
      checksum: metadata.checksumSha256,
      tagCount: uniqueTags.length,
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await acquireEnrollmentIdentityWriterLock(tx, metadata.ownerUserId);
        const enrolledUser = await tx.user.findUnique({
          where: { id: metadata.ownerUserId },
          select: { id: true },
        });
        if (!enrolledUser) {
          throw new EnrollmentUnavailableError();
        }

        // Create the asset
        const asset = await tx.asset.create({
          data: {
            ownerUserId: metadata.ownerUserId,
            blobUrl: metadata.blobUrl,
            thumbnailUrl: metadata.thumbnailUrl,
            pathname: metadata.pathname,
            thumbnailPath: metadata.thumbnailPath,
            ...(metadata.storageProvider ? { storageProvider: metadata.storageProvider } : {}),
            ...(metadata.storageKey !== undefined ? { storageKey: metadata.storageKey } : {}),
            ...(metadata.thumbnailStorageKey !== undefined ? { thumbnailStorageKey: metadata.thumbnailStorageKey } : {}),
            ...(metadata.storageConfigFingerprint !== undefined ? { storageConfigFingerprint: metadata.storageConfigFingerprint } : {}),
            ...(metadata.storageSize !== undefined ? { storageSize: metadata.storageSize } : {}),
            ...(metadata.storageSha256 !== undefined ? { storageSha256: metadata.storageSha256 } : {}),
            ...(metadata.thumbnailStorageSize !== undefined ? { thumbnailStorageSize: metadata.thumbnailStorageSize } : {}),
            ...(metadata.thumbnailStorageSha256 !== undefined ? { thumbnailStorageSha256: metadata.thumbnailStorageSha256 } : {}),
            mime: metadata.mime,
            width: metadata.width,
            height: metadata.height,
            size: metadata.size,
            checksumSha256: metadata.checksumSha256,
            phash: metadata.phash ?? null,
            favorite: false,
          },
        });

        if (metadata.storageReplicas && metadata.storageReplicas.length > 0) {
          await tx.assetStorageReplica.createMany({
            data: metadata.storageReplicas.map((replica) => ({
              assetId: asset.id,
              rendition: replica.rendition,
              provider: replica.provider,
              sourceKey: replica.provider === 'vercel' ? replica.key : null,
              logicalKey: replica.key,
              deliveryUrl: replica.url,
              size: replica.size,
              sha256: replica.sha256,
              contentType: replica.contentType ?? metadata.mime,
              generation: replica.generation ?? 0,
              active: replica.active ?? replica.provider === (metadata.storageProvider ?? replica.provider),
            })),
            skipDuplicates: true,
          });
        }

        let tagsCreated = 0;
        let tagsAssociated = 0;

        // Batch process tags if any provided
        if (uniqueTags.length > 0) {
          const tagResult = await this.batchCreateTags(
            tx,
            metadata.ownerUserId,
            uniqueTags,
            asset.id
          );
          tagsCreated = tagResult.tagsCreated;
          tagsAssociated = tagResult.tagsAssociated;
        }

        if (metadata.releaseQuotaReservationId) {
          await tx.storageQuotaReservation.deleteMany({
            where: { id: metadata.releaseQuotaReservationId },
          });
        }

        logger.info('Asset recorded successfully', {
          assetId: asset.id,
          userId: metadata.ownerUserId,
          tagsCreated,
          tagsAssociated,
        });

        return {
          asset,
          tagsCreated,
          tagsAssociated,
        };
      });

      return result;
    } catch (error) {
      logger.error('Failed to record asset', {
        userId: metadata.ownerUserId,
        checksum: metadata.checksumSha256,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isEnrollmentUnavailableError(error)) throw error;
      throw new AssetRecordError(
        'Failed to record asset in database',
        true, // Retryable - could be transient DB issue
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Batch create tags and associations (fixes N+1 query problem)
   *
   * Old approach (N+1):
   * - For each tag: findFirst (1 query)
   * - For each new tag: create (1 query)
   * - For each tag: create association (1 query)
   * Total: Up to 3N queries for N tags
   *
   * New approach (batched):
   * - 1 findMany query for all tags
   * - 1 createMany for all new tags
   * - 1 createMany for all associations
   * Total: 3 queries regardless of tag count
   */
  private async batchCreateTags(
    tx: Prisma.TransactionClient,
    userId: string,
    tagNames: string[],
    assetId: string
  ): Promise<{ tagsCreated: number; tagsAssociated: number }> {
    // Batch query: Find all existing tags in one query
    const existingTags = await tx.tag.findMany({
      where: {
        ownerUserId: userId,
        name: { in: tagNames },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Build lookup map for O(1) existence checks
    const existingTagMap = new Map<string, string>(
      existingTags.map((tag: { id: string; name: string }) => [tag.name, tag.id])
    );

    // Identify new tags that need creation
    const newTagNames = tagNames.filter(name => !existingTagMap.has(name));
    if (typeof tx.tag.count !== 'function' || typeof tx.assetTag.count !== 'function') {
      throw new Error('tag count queries are unavailable');
    }
    const [tagCount, assetTagCount] = await Promise.all([
      tx.tag.count({ where: { ownerUserId: userId } }),
      tx.assetTag.count({ where: { assetId } }),
    ]);
    if (tagCount + newTagNames.length > TAG.maxPerUser || assetTagCount + tagNames.length > TAG.maxPerAsset) {
      throw new Error('tag metadata exceeds shared count bounds');
    }

    let tagsCreated = 0;

    // Batch create: Create all new tags in one query
    if (newTagNames.length > 0) {
      const createResult = await tx.tag.createManyAndReturn({
        data: newTagNames.map(name => ({
          ownerUserId: userId,
          name,
        })),
        select: {
          id: true,
          name: true,
        },
      });

      // Add newly created tags to lookup map
      for (const tag of createResult) {
        existingTagMap.set(tag.name, tag.id);
      }

      tagsCreated = createResult.length;

      logger.debug('Created new tags', {
        count: tagsCreated,
        names: newTagNames,
      });
    }

    // Batch associate: Create all associations in one query
    const associations = tagNames.map(name => ({
      assetId,
      tagId: existingTagMap.get(name)!,
    }));

    await tx.assetTag.createMany({
      data: associations,
      skipDuplicates: true, // Skip if association already exists
    });

    logger.debug('Created tag associations', {
      count: associations.length,
      assetId,
    });

    return {
      tagsCreated,
      tagsAssociated: associations.length,
    };
  }

  /**
   * Sanitize tags: trim whitespace, deduplicate, remove empty
   */
  private sanitizeTags(tags: string[]): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }
    if (tags.length > TAG.maxRequestItems || tags.some((tag) => typeof tag === 'string' && tag.trim().length > TAG.maxNameLength)) {
      throw new Error('tag metadata exceeds shared bounds');
    }

    const uniqueTags = new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
    );

    return Array.from(uniqueTags);
  }

  /**
   * Add tags to existing asset (for duplicate uploads)
   */
  async addTagsToAsset(
    assetId: string,
    userId: string,
    tags: string[]
  ): Promise<{ tagsCreated: number; tagsAssociated: number }> {
    if (!prisma) {
      throw new EnrollmentUnavailableError();
    }

    const uniqueTags = this.sanitizeTags(tags);

    if (uniqueTags.length === 0) {
      return { tagsCreated: 0, tagsAssociated: 0 };
    }

    logger.debug('Adding tags to existing asset', {
      assetId,
      userId,
      tagCount: uniqueTags.length,
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await acquireEnrollmentIdentityWriterLock(tx, userId);
        const enrolledUser = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        });
        if (!enrolledUser) {
          throw new EnrollmentUnavailableError();
        }
        return await this.batchCreateTags(tx, userId, uniqueTags, assetId);
      });

      logger.info('Tags added to asset', {
        assetId,
        tagsCreated: result.tagsCreated,
        tagsAssociated: result.tagsAssociated,
      });

      return result;
    } catch (error) {
      logger.error('Failed to add tags to asset', {
        assetId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (isEnrollmentUnavailableError(error)) throw error;
      throw new AssetRecordError(
        'Failed to add tags to asset',
        true,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

/**
 * Singleton instance for convenience
 */
let defaultRecorder: AssetRecorderService | null = null;

export function getAssetRecorder(): AssetRecorderService {
  if (!defaultRecorder) {
    defaultRecorder = new AssetRecorderService();
  }
  return defaultRecorder;
}
