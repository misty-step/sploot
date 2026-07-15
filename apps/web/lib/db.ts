import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { databaseConfigured } from './env';
import logger from './logger';
import { shuffleWithSeed } from './seeded-random';
import { getPerformanceMonitor } from './performance-monitor';
import { logger as observabilityLogger } from './observability-logger';
import { embeddingVectorSql } from './embedding-vector-sql';
import {
  acquireEnrollmentAdvisoryLock,
  acquireEnrollmentIdentityWriterLock,
  assertNewEnrollmentAllowed,
  getEnrollmentStatus,
  EnrollmentIdentityConflictError,
  EnrollmentDeniedError,
  EnrollmentUnavailableError,
  isEnrollmentDeniedError,
  isEnrollmentIdentityConflictError,
  isEnrollmentUnavailableError,
} from './enrollment/enrollment-policy';

// Declare global type for PrismaClient to prevent multiple instances in development
declare global {
  var prisma: PrismaClient | undefined;
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

function createExtendedClient(baseClient: PrismaClient) {
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          const modelName = model ?? 'raw';
          const operationName = `db:${modelName}:${operation}`;
          const startTime = Date.now();
          const perfMonitor = getPerformanceMonitor();

          perfMonitor.startTiming(operationName);

          try {
            const result = await query(args);
            const duration = Date.now() - startTime;
            perfMonitor.endTiming(operationName);

            if (duration > 100) {
              observabilityLogger.logInfo('db:slow-query', {
                model: modelName,
                action: operation,
                duration,
              });
            }

            return result;
          } catch (error) {
            const duration = Date.now() - startTime;
            perfMonitor.endTiming(operationName);

            observabilityLogger.logError('db:query-failed', error, {
              model: modelName,
              action: operation,
              duration,
            });

            throw error;
          }
        },
      },
    },
  });
}

let prismaClient: ExtendedPrismaClient | PrismaClient | null = null;

if (databaseConfigured) {
  // Prisma reads DATABASE_URL from schema - no override needed
  prismaClient = global.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    global.prisma = prismaClient;
  }

  // Startup logging: Log database configuration (production-safe)
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      // Redact password from URL for logging
      const redactedUrl = databaseUrl.replace(/:([^@]+)@/, ':****@');

      // Parse URL to extract metadata
      let hostname = 'unknown';
      let params = '';
      try {
        const url = new URL(databaseUrl);
        hostname = url.hostname;
        params = url.search;
      } catch (e) {
        // URL parsing failed - still log what we can
      }

      observabilityLogger.logInfo('db:prisma-initialized', {
        database_url_configured: true,
        database_url_redacted: redactedUrl,
        database_hostname: hostname,
        database_params: params,
        is_pooler_endpoint: hostname.includes('-pooler'),
        has_pgbouncer_param: params.includes('pgbouncer=true'),
        node_version: process.version,
        platform: process.platform,
        deployment_environment: process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'unknown',
        prisma_version: Prisma.prismaVersion?.client || 'unknown',
      });
    } else {
      observabilityLogger.logInfo('db:prisma-initialized', {
        database_url_configured: false,
        node_version: process.version,
        platform: process.platform,
        deployment_environment: process.env.DEPLOYMENT_ENV || process.env.NODE_ENV || 'unknown',
      });
    }
  } catch (logError) {
    // Never fail app startup due to logging
    console.error('Failed to log database configuration:', logError);
  }

  // Apply query monitoring extension using Prisma 5+ API
  try {
    if (prismaClient) {
      prismaClient = createExtendedClient(prismaClient);
    }
  } catch (middlewareError) {
    observabilityLogger.logError(
      'db:middleware-init-failed',
      middlewareError as Error,
      {}
    );
  }
}

// Export as the original PrismaClient type to maintain API compatibility
export const prisma = prismaClient as unknown as PrismaClient;

/**
 * Sync user data from Clerk to database.
 * Creates user if not exists, updates email if changed.
 * Handles orphaned records by replacing them with current Clerk user.
 */
export async function syncUser(clerkUserId: string, email: string) {
  if (!prisma) {
    const enrollmentStatus = getEnrollmentStatus();
    const deploymentMarker = process.env.SPLOOT_DEPLOYMENT_ENV?.trim().toLowerCase();
    const explicitlyLocal =
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      deploymentMarker === 'development' ||
      deploymentMarker === 'test';
    if (!explicitlyLocal || enrollmentStatus.configuration !== 'valid') {
      throw new EnrollmentUnavailableError();
    }

    return {
      id: clerkUserId,
      email,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  try {
    return await executeUserSyncTransaction(async (tx) => {
    // User identity replacement and new-account admission share one
    // application-wide serialization point. This keeps the email lookup,
    // identity decision, and ownership move on the same database timeline.
    await acquireEnrollmentAdvisoryLock(tx);
    const existingUserById = await tx.user.findUnique({ where: { id: clerkUserId } });
    const existingUserByEmail = await tx.user.findUnique({ where: { email } });

    if (existingUserById) {
      if (existingUserByEmail && existingUserByEmail.id !== clerkUserId) {
        throw new EnrollmentIdentityConflictError();
      }

      const user = await tx.user.update({
        where: { id: clerkUserId },
        data: { email },
      });
      await syncClerkIdentity(tx, clerkUserId, user.id, email);
      return user;
    }

    if (!existingUserByEmail) {
      await assertNewEnrollmentAllowed(tx);
      const user = await tx.user.create({ data: { id: clerkUserId, email } });
      await syncClerkIdentity(tx, clerkUserId, user.id, email);
      return user;
    }

    // A user that already carries a replacement/current Clerk subject is a
    // real account, not an orphan to migrate again. Replacing it would make a
    // second concurrent recovery silently move the same library onward.
    const emailUserClerkIdentities = await tx.userIdentity.findMany({
      where: { userId: existingUserByEmail.id, provider: 'clerk' },
      select: { providerSubject: true },
    });
    if (emailUserClerkIdentities.some((identity) => identity.providerSubject !== existingUserByEmail.id)) {
      throw new EnrollmentIdentityConflictError();
    }

    logger.warn('Detected identity-backed orphaned user, migrating ownership', {
      orphanedId: existingUserByEmail.id,
      newClerkUserId: clerkUserId,
      email,
    });
    return migrateOrphanedUser(tx, existingUserByEmail.id, clerkUserId, email);
    }, 5, 15000);
  } catch (error: unknown) {
    if (
      error instanceof EnrollmentDeniedError ||
      isEnrollmentDeniedError(error) ||
      isEnrollmentUnavailableError(error) ||
      isEnrollmentIdentityConflictError(error)
    ) {
      throw error;
    }
    throw new EnrollmentUnavailableError();
  }
}

async function executeUserSyncTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5,
  timeout = 5000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma!.$transaction(action, {
        timeout,
        // The per-identity advisory fence can wait for a writer that started
        // before this transaction. READ COMMITTED gives the first relation
        // statement after that fence a fresh snapshot, so a writer-held
        // SearchLog/lease cannot commit behind an old serializable snapshot.
        // Admission remains indivisible because its aggregate lock and User
        // INSERT are in this same transaction. P2034/deadlock retries remain
        // enabled for providers that surface them.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error: unknown) {
      const pgCode = getPrismaErrorCode(error);
      const isSerializationConflict =
        pgCode === 'P2034' ||
        pgCode === '40001' || pgCode === '40P01' ||
        (error instanceof Error && (
          error.message.includes('write conflict') ||
          error.message.includes('deadlock detected') ||
          error.message.includes('serialization failure')
        ));

      if (!isSerializationConflict || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
    }
  }

  throw new Error('BUG: user sync transaction retry loop terminated');
}

async function migrateOrphanedUser(
  tx: Prisma.TransactionClient,
  oldUserId: string,
  newUserId: string,
  email: string,
) {
  await acquireEnrollmentAdvisoryLock(tx);
  await acquireEnrollmentIdentityWriterLock(tx, oldUserId);
  const [targetUser, currentIdentity, oldIdentities] = await Promise.all([
    tx.user.findUnique({ where: { id: newUserId } }),
    tx.userIdentity.findUnique({
      where: {
        unique_provider_subject: {
          provider: 'clerk',
          providerSubject: newUserId,
        },
      },
    }),
    tx.userIdentity.findMany({ where: { userId: oldUserId } }),
  ]);

  if (targetUser || (currentIdentity && currentIdentity.userId !== oldUserId)) {
    throw new EnrollmentIdentityConflictError();
  }

  const clerkSubjects = oldIdentities
    .filter((identity) => identity.provider === 'clerk')
    .map((identity) => identity.providerSubject);
  if (clerkSubjects.length === 0 || clerkSubjects.some((subject) => subject !== oldUserId && subject !== newUserId)) {
    throw new EnrollmentIdentityConflictError();
  }

  const tempEmail = `${email}.migrating.${randomUUID()}`;
  await tx.user.create({ data: { id: newUserId, email: tempEmail } });

  // Keep this list explicit: these are every user-owned relation in the
  // Prisma schema, plus the lease table whose user_id is intentionally
  // unmodeled because it is ephemeral and does not have a foreign key.
  await tx.asset.updateMany({ where: { ownerUserId: oldUserId }, data: { ownerUserId: newUserId } });
  await tx.tag.updateMany({ where: { ownerUserId: oldUserId }, data: { ownerUserId: newUserId } });
  await tx.searchLog.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
  await tx.userStorageQuota.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
  await tx.storageQuotaReservation.updateMany({ where: { ownerUserId: oldUserId }, data: { ownerUserId: newUserId } });
  await tx.uploadToken.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
  await tx.embeddingRateLease.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });
  await tx.userIdentity.updateMany({ where: { userId: oldUserId }, data: { userId: newUserId } });

  await tx.user.delete({ where: { id: oldUserId } });
  const user = await tx.user.update({ where: { id: newUserId }, data: { email } });
  // Validate the identity replacement itself, not a database-wide count that
  // can legitimately change under READ COMMITTED while unrelated enrollments
  // complete. This transaction must leave exactly one of the old/new IDs.
  if (await tx.user.count({ where: { id: { in: [oldUserId, newUserId] } } }) !== 1) {
    throw new EnrollmentUnavailableError();
  }
  await syncClerkIdentity(tx, newUserId, user.id, email);
  return user;
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
  }

  return undefined;
}

async function syncClerkIdentity(
  tx: Prisma.TransactionClient,
  clerkUserId: string,
  userId: string,
  email: string,
) {
  await syncClerkIdentityStrict(tx, clerkUserId, userId, email);
}

async function syncClerkIdentityStrict(
  tx: Prisma.TransactionClient,
  clerkUserId: string,
  userId: string,
  email: string,
) {
  await tx.userIdentity.upsert({
    where: {
      unique_provider_subject: {
        provider: 'clerk',
        providerSubject: clerkUserId,
      },
    },
    update: {
      userId,
      email,
    },
    create: {
      userId,
      provider: 'clerk',
      providerSubject: clerkUserId,
      email,
    },
  });
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
    tx?: Prisma.TransactionClient;
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
    throw new EnrollmentUnavailableError();
  }

  // Use a transaction to handle race conditions
  return await prisma.$transaction(async (tx) => {
    await acquireEnrollmentIdentityWriterLock(tx, userId);
    const enrolledUser = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!enrolledUser) throw new EnrollmentUnavailableError();
    // First check if asset already exists
    const existing = await assetExists(userId, assetData.checksumSha256, { tx });

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
        const existing = await assetExists(userId, assetData.checksumSha256, { tx });
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
  data: AssetEmbeddingWriteArgs,
  expectedProcessingClaimToken?: string,
): Promise<AssetEmbeddingRecord | null> {
  const { assetId, modelName, modelVersion, dim, embedding } = data;
  const vectorSql = embeddingVectorSql(embedding, 'asset embedding');

  if (embedding.length !== dim) {
    throw new Error('Embedding dimension does not match provided dim value');
  }

  if (dim !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding dimension expected ${EMBEDDING_DIMENSION}, got ${dim}`);
  }

  if (!prisma) {
    return null;
  }

  try {
    // A paid worker must only settle the exact processing claim it acquired.
    // Once a crashed claim is reclaimed, its stale worker can still finish at
    // the provider; fencing by a unique claim token prevents that
    // late result from overwriting the newer owner's state.
    if (expectedProcessingClaimToken) {
      const rows = await prisma.$queryRaw<Array<AssetEmbeddingRecord>>(Prisma.sql`
        UPDATE "asset_embeddings"
        SET "model_name" = ${modelName},
            "model_version" = ${modelVersion},
            "dim" = ${dim},
            "image_embedding" = ${vectorSql},
            "status" = 'ready',
            "error" = NULL,
            "attempt_count" = 0,
            "next_attempt_at" = NULL,
            "terminal_at" = NULL,
            "processing_claim_token" = NULL,
            "completedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "asset_id" = ${assetId}
          AND "status" = 'processing'
          AND "processing_claim_token" = ${expectedProcessingClaimToken}
          AND "image_embedding" IS NULL
          AND ("dim" IS NULL OR "dim" = 0)
          AND "terminal_at" IS NULL
        RETURNING
          "asset_id" AS "assetId",
          "model_name" AS "modelName",
          "model_version" AS "modelVersion",
          "dim",
          "createdAt",
          "updatedAt";
      `);
      return rows[0] ?? null;
    }

    const rows = await prisma.$queryRaw<Array<AssetEmbeddingRecord>>(Prisma.sql`
      INSERT INTO "asset_embeddings" (
        "asset_id",
        "model_name",
        "model_version",
        "dim",
        "image_embedding",
        "status",
        "error",
        "completedAt",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${assetId},
        ${modelName},
        ${modelVersion},
        ${dim},
        ${vectorSql},
        'ready',
        NULL,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT ("asset_id") DO UPDATE SET
        "model_name" = EXCLUDED."model_name",
        "model_version" = EXCLUDED."model_version",
        "dim" = EXCLUDED."dim",
        "image_embedding" = EXCLUDED."image_embedding",
        "status" = 'ready',
        "error" = NULL,
        "attempt_count" = 0,
        "next_attempt_at" = NULL,
        "terminal_at" = NULL,
        "processing_claim_token" = NULL,
        "completedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "asset_embeddings"."image_embedding" IS NULL
        AND ("asset_embeddings"."dim" IS NULL OR "asset_embeddings"."dim" = 0)
        AND NOT (
          "asset_embeddings"."status" = 'processing'
          AND "asset_embeddings"."processing_claim_token" IS NOT NULL
        )
        AND "asset_embeddings"."terminal_at" IS NULL
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
export interface VectorSearchRow {
  id: string;
  blob_url: string;
  thumbnail_url: string | null;
  pathname: string;
  mime: string;
  width: number | null;
  height: number | null;
  favorite: boolean;
  size: number;
  created_at: Date;
  distance: number;
}

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

  const vectorSql = embeddingVectorSql(queryEmbedding, 'search query embedding');

  // Fetch more candidates when shuffling or thresholding for better pool
  const fetchLimit = shuffleSeed !== undefined
    ? Math.min(limit * 3, 120) // Fetch 3x for better shuffle pool
    : (typeof threshold === 'number' && threshold > 0
        ? Math.min(limit * 3, 120)
        : limit);

  try {
    // ALWAYS order by similarity (preserve semantic ranking)
    // Shuffle happens in application code after fetching top results
    const results = await prisma.$queryRaw<VectorSearchRow[]>(Prisma.sql`
      SELECT
        a.id,
        a.blob_url,
        a.thumbnail_url,
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
    await prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const enrolledUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!enrolledUser) return;
      await tx.searchLog.create({
        data: { userId, query, resultCount, queryTime },
      });
    });
  } catch (error) {
    // Log search analytics failures shouldn't break the app
    // Search logging error suppressed
  }
}
