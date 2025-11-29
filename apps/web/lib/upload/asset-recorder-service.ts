import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Asset } from '@prisma/client';

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
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  checksumSha256: string;
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
      throw new AssetRecordError(
        'Database not configured',
        false // Not retryable - configuration issue
      );
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
        // Create the asset
        const asset = await tx.asset.create({
          data: {
            ownerUserId: metadata.ownerUserId,
            blobUrl: metadata.blobUrl,
            thumbnailUrl: metadata.thumbnailUrl,
            pathname: metadata.pathname,
            thumbnailPath: metadata.thumbnailPath,
            mime: metadata.mime,
            width: metadata.width,
            height: metadata.height,
            size: metadata.size,
            checksumSha256: metadata.checksumSha256,
            favorite: false,
          },
        });

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
    tx: any,
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

    const uniqueTags = new Set(
      tags
        .filter(tag => typeof tag === 'string')
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
      throw new AssetRecordError('Database not configured', false);
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
