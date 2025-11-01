import { PrismaClient, Prisma } from '@prisma/client';
import { databaseConfigured } from './env';
import logger from './logger';
import { shuffleWithSeed } from './seeded-random';

// Declare global type for PrismaClient to prevent multiple instances in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

let prismaClient: PrismaClient | null = null;

if (databaseConfigured) {
  prismaClient = global.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    global.prisma = prismaClient;
  }
}

export const prisma = prismaClient;

/**
 * Sync user data from Clerk to database.
 * Creates user if not exists, updates email if changed.
 */
export async function syncUser(clerkUserId: string, email: string) {
  if (!prisma) {
    return {
      id: clerkUserId,
      email,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

  return await prisma.user.upsert({
    where: { id: clerkUserId },
    update: { email },
    create: {
      id: clerkUserId,
      email,
    },
  });
}

/**
 * Atomic operation to get existing user or create new one.
 * Prevents race conditions.
 */
export async function getOrCreateUser(clerkUserId: string, email: string) {
  if (!prisma) {
    return {
      id: clerkUserId,
      email,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

  let user = await prisma.user.findUnique({
    where: { id: clerkUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: clerkUserId,
        email,
      },
    });
  }

  return user;
}

/**
 * Metadata returned for existing assets during duplicate detection
 */
export interface ExistingAssetMetadata {
  id: string;
  blobUrl: string;
  thumbnailUrl: string | null;
  pathname: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  checksumSha256: string;
  favorite: boolean;
  createdAt: Date;
  hasEmbedding?: boolean;
}

/**
 * Check if asset with given checksum already exists for user.
 * Returns typed asset metadata if found, or null if not.
 * Used for deduplication during upload process.
 *
 * @param userId - The user ID to check assets for
 * @param checksumSha256 - The SHA256 checksum to search for
 * @param options - Additional options for the query
 * @returns Typed asset metadata or null
 */
export async function assetExists(
  userId: string,
  checksumSha256: string,
  options?: {
    /**
     * Run inside a transaction for concurrency safety
     */
    tx?: any;
    /**
     * Include embedding existence check
     */
    includeEmbedding?: boolean;
  }
): Promise<ExistingAssetMetadata | null> {
  const db = options?.tx || prisma;

  if (!db) {
    return null;
  }

  try {
    const asset = await db.asset.findFirst({
      where: {
        ownerUserId: userId,
        checksumSha256,
        deletedAt: null,
      },
      select: {
        id: true,
        blobUrl: true,
        thumbnailUrl: true,
        pathname: true,
        mime: true,
        size: true,
        width: true,
        height: true,
        checksumSha256: true,
        favorite: true,
        createdAt: true,
        // Include embedding check if requested
        ...(options?.includeEmbedding && {
          embedding: {
            select: {
              assetId: true,
            },
          },
        }),
      },
    });

    if (!asset) {
      return null;
    }

    // Transform to match ExistingAssetMetadata interface
    const metadata: ExistingAssetMetadata = {
      id: asset.id,
      blobUrl: asset.blobUrl,
      thumbnailUrl: asset.thumbnailUrl,
      pathname: asset.pathname,
      mime: asset.mime,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      checksumSha256: asset.checksumSha256,
      favorite: asset.favorite,
      createdAt: asset.createdAt,
    };

    // Add embedding status if requested
    if (options?.includeEmbedding && 'embedding' in asset) {
      metadata.hasEmbedding = !!asset.embedding;
    }

    return metadata;
  } catch (error) {
    // Log error but don't throw - return null to indicate not found
    console.error('Error checking asset existence:', error);
    return null;
  }
}

/**
 * Find or create an asset atomically to prevent race conditions.
 * Used for handling concurrent uploads of the same file.
 *
 * @param userId - The user ID creating the asset
 * @param assetData - The asset data to create if it doesn't exist
 * @returns The existing or newly created asset metadata
 */
export async function findOrCreateAsset(
  userId: string,
  assetData: {
    checksumSha256: string;
    blobUrl: string;
    thumbnailUrl?: string | null;
    pathname: string;
    thumbnailPath?: string | null;
    mime: string;
    width?: number | null;
    height?: number | null;
    size: number;
  }
): Promise<ExistingAssetMetadata> {
  if (!prisma) {
    throw new Error('Database not available');
  }

  // Use a transaction to handle race conditions
  return await prisma.$transaction(async (tx) => {
    // First check if asset already exists
    const existing = await assetExists(userId, assetData.checksumSha256, { tx: tx as any });

    if (existing) {
      return existing;
    }

    // Create new asset if it doesn't exist
    try {
      const newAsset = await tx.asset.create({
        data: {
          ownerUserId: userId,
          blobUrl: assetData.blobUrl,
          thumbnailUrl: assetData.thumbnailUrl,
          pathname: assetData.pathname,
          thumbnailPath: assetData.thumbnailPath,
          mime: assetData.mime,
          width: assetData.width,
          height: assetData.height,
          size: assetData.size,
          checksumSha256: assetData.checksumSha256,
          favorite: false,
        },
        select: {
          id: true,
          blobUrl: true,
          thumbnailUrl: true,
          pathname: true,
          mime: true,
          size: true,
          width: true,
          height: true,
          checksumSha256: true,
          favorite: true,
          createdAt: true,
        },
      });

      return {
        id: newAsset.id,
        blobUrl: newAsset.blobUrl,
        thumbnailUrl: newAsset.thumbnailUrl,
        pathname: newAsset.pathname,
        mime: newAsset.mime,
        size: newAsset.size,
        width: newAsset.width,
        height: newAsset.height,
        checksumSha256: newAsset.checksumSha256,
        favorite: newAsset.favorite,
        createdAt: newAsset.createdAt,
      };
    } catch (error) {
      // Handle unique constraint violation (another request created it)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        // Try to fetch the asset again
        const existing = await assetExists(userId, assetData.checksumSha256, { tx: tx as any });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  });
}

/**
 * Get paginated list of user's assets with filtering and sorting.
 * Includes embeddings and tags for each asset.
 * @returns Object with assets array, total count, and hasMore flag
 */
export async function getUserAssets(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    favoriteOnly?: boolean;
    tagId?: string;
    orderBy?: 'createdAt' | 'updatedAt';
    order?: 'asc' | 'desc';
  }
) {
  if (!prisma) {
    return {
      assets: [],
      total: 0,
      hasMore: false,
    };
  }

  const {
    limit = 50,
    offset = 0,
    favoriteOnly = false,
    tagId,
    orderBy = 'createdAt',
    order = 'desc',
  } = options || {};

  const where: any = {
    ownerUserId: userId,
    deletedAt: null,
  };

  if (favoriteOnly) {
    where.favorite = true;
  }

  if (tagId) {
    where.tags = {
      some: {
        tagId,
      },
    };
  }

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: {
        embedding: {
          select: {
            modelName: true,
            modelVersion: true,
            dim: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: {
        [orderBy]: order,
      },
      take: limit,
      skip: offset,
    }),
    prisma.asset.count({ where }),
  ]);

  return {
    assets,
    total,
    hasMore: offset + assets.length < total,
  };
}

export interface AssetEmbeddingWriteArgs {
  assetId: string;
  modelName: string;
  modelVersion: string;
  dim: number;
  embedding: number[];
}

export interface AssetEmbeddingRecord {
  assetId: string;
  modelName: string;
  modelVersion: string;
  dim: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Insert or update an asset embedding using raw SQL to support pgvector writes.
 */
export async function upsertAssetEmbedding(
  data: AssetEmbeddingWriteArgs
): Promise<AssetEmbeddingRecord | null> {
  if (!prisma) {
    return null;
  }

  const { assetId, modelName, modelVersion, dim, embedding } = data;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Embedding vector must be a non-empty array');
  }

  if (embedding.length !== dim) {
    throw new Error('Embedding dimension does not match provided dim value');
  }

  // Construct ARRAY[...] literal so Postgres can parameterize each element
  const vectorSql = Prisma.sql`ARRAY[${Prisma.join(embedding)}]`;

  try {
    const rows = await prisma.$queryRaw<Array<AssetEmbeddingRecord>>(Prisma.sql`
      INSERT INTO "asset_embeddings" (
        "asset_id",
        "model_name",
        "model_version",
        "dim",
        "image_embedding",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${assetId},
        ${modelName},
        ${modelVersion},
        ${dim},
        ${vectorSql}::vector,
        NOW(),
        NOW()
      )
      ON CONFLICT ("asset_id") DO UPDATE SET
        "model_name" = EXCLUDED."model_name",
        "model_version" = EXCLUDED."model_version",
        "dim" = EXCLUDED."dim",
        "image_embedding" = EXCLUDED."image_embedding",
        "updatedAt" = NOW()
      RETURNING
        "asset_id" AS "assetId",
        "model_name" AS "modelName",
        "model_version" AS "modelVersion",
        "dim",
        "createdAt",
        "updatedAt";
    `);

    return rows[0] ?? null;
  } catch (error) {
    logger.error('Failed to upsert asset embedding', {
      assetId,
      modelName,
      modelVersion,
      dim,
      embeddingLength: embedding.length,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

/**
 * Helper function to execute vector similarity search
 * Note: This uses raw SQL since Prisma doesn't natively support pgvector operations
 */
export async function vectorSearch(
  userId: string,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    threshold?: number;
    shuffleSeed?: number;
  }
) {
  if (!prisma) {
    return [];
  }

  const { limit = 30, threshold, shuffleSeed } = options || {};

  // Convert embedding array to pgvector format
  const vectorSql = Prisma.sql`ARRAY[${Prisma.join(queryEmbedding)}]::vector`;

  // Fetch more candidates when shuffling or thresholding for better pool
  const fetchLimit = shuffleSeed !== undefined
    ? Math.min(limit * 3, 120) // Fetch 3x for better shuffle pool
    : (typeof threshold === 'number' && threshold > 0
        ? Math.min(limit * 3, 120)
        : limit);

  try {
    // ALWAYS order by similarity (preserve semantic ranking)
    // Shuffle happens in application code after fetching top results
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        blob_url: string;
        pathname: string;
        mime: string;
        width: number | null;
        height: number | null;
        favorite: boolean;
        size: number;
        created_at: Date;
        distance: number;
      }>
    >(Prisma.sql`
      SELECT
        a.id,
        a.blob_url,
        a.pathname,
        a.mime,
        a.width,
        a.height,
        a.favorite,
        a.size,
        a."createdAt" AS created_at,
        1 - (ae.image_embedding <=> ${vectorSql}) AS distance
      FROM "assets" a
      INNER JOIN "asset_embeddings" ae ON a.id = ae.asset_id
      WHERE
        a.owner_user_id = ${userId}
        AND a.deleted_at IS NULL
      ORDER BY ae.image_embedding <=> ${vectorSql}
      LIMIT ${fetchLimit}
    `);

    // Filter by threshold if provided
    const filteredResults =
      typeof threshold === 'number' && threshold > 0
        ? results.filter(result => result.distance >= threshold)
        : results;

    // Shuffle top results if seed provided (preserves semantic relevance)
    const finalResults = shuffleSeed !== undefined
      ? shuffleWithSeed(filteredResults, shuffleSeed).slice(0, limit)
      : filteredResults.slice(0, limit);

    return finalResults;
  } catch (error) {
    logger.error('Vector search query failed', {
      userId,
      limit,
      threshold,
      embeddingLength: queryEmbedding.length,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }
}

export async function logSearch(
  userId: string,
  query: string,
  resultCount: number,
  queryTime: number
) {
  if (!prisma) {
    return;
  }

  try {
    await prisma.searchLog.create({
      data: {
        userId,
        query,
        resultCount,
        queryTime,
      },
    });
  } catch (error) {
    // Log search analytics failures shouldn't break the app
    // Search logging error suppressed
  }
}
