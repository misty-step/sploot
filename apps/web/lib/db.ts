import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { databaseConfigured } from './env';
import { normalizeSearchQuery, SEARCH_MAX_CURSOR_LENGTH, SEARCH_MAX_LIMIT } from './search-config';
export { normalizeSearchQuery } from './search-config';
import logger from './logger';
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
  await tx.libraryExport.updateMany({ where: { ownerUserId: oldUserId }, data: { ownerUserId: newUserId } });
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
  storageProvider?: string;
  storageKey?: string | null;
  storageSourceKey?: string | null;
  thumbnailStorageKey?: string | null;
  thumbnailStorageSourceKey?: string | null;
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
        storageProvider: true,
        storageKey: true,
        storageSourceKey: true,
        thumbnailStorageKey: true,
        thumbnailStorageSourceKey: true,
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
      storageProvider: asset.storageProvider,
      storageKey: asset.storageKey,
      storageSourceKey: asset.storageSourceKey,
      thumbnailStorageKey: asset.thumbnailStorageKey,
      thumbnailStorageSourceKey: asset.thumbnailStorageSourceKey,
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
    storageProvider?: string;
    storageKey?: string | null;
    storageSourceKey?: string | null;
    thumbnailStorageKey?: string | null;
    thumbnailStorageSourceKey?: string | null;
    storageConfigFingerprint?: string | null;
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
          ...(assetData.storageProvider ? { storageProvider: assetData.storageProvider } : {}),
          ...(assetData.storageKey !== undefined ? { storageKey: assetData.storageKey } : {}),
          ...(assetData.storageSourceKey !== undefined ? { storageSourceKey: assetData.storageSourceKey } : {}),
          ...(assetData.thumbnailStorageKey !== undefined ? { thumbnailStorageKey: assetData.thumbnailStorageKey } : {}),
          ...(assetData.thumbnailStorageSourceKey !== undefined ? { thumbnailStorageSourceKey: assetData.thumbnailStorageSourceKey } : {}),
          ...(assetData.storageConfigFingerprint !== undefined ? { storageConfigFingerprint: assetData.storageConfigFingerprint } : {}),
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
          storageProvider: true,
          storageKey: true,
          storageSourceKey: true,
          thumbnailStorageKey: true,
          thumbnailStorageSourceKey: true,
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
        storageProvider: newAsset.storageProvider,
        storageKey: newAsset.storageKey,
        storageSourceKey: newAsset.storageSourceKey,
        thumbnailStorageKey: newAsset.thumbnailStorageKey,
        thumbnailStorageSourceKey: newAsset.thumbnailStorageSourceKey,
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

    // An un-tokened writer cannot prove which processing generation it owns.
    // It may seed a brand-new row, but must never update an existing row: an
    // old worker can finish after its claim was reclaimed by a newer worker.
    // Token-aware current writers take the update path above and clear only
    // their matching token atomically.
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
      ON CONFLICT ("asset_id") DO NOTHING
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

export interface VectorSearchPage {
  results: VectorSearchRow[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

export const VECTOR_SEARCH_CURSOR_CONTEXT_ERROR = 'Search cursor does not match search context';

export interface VectorSearchContext {
  query: string;
  threshold: number;
  sort: 'relevance';
  direction: 'desc';
  favoriteOnly: boolean;
  tagId: string | null;
  limit: number;
}

interface VectorSearchCursor {
  version: 2;
  order: 'relevance';
  id: string;
  distance: number;
  context: VectorSearchContext;
}

export function createVectorSearchContext(input: {
  query: string;
  threshold: number;
  favoriteOnly?: boolean;
  tagId?: string | null;
  limit: number;
}): VectorSearchContext {
  const normalizedTagId = typeof input.tagId === 'string' ? input.tagId.trim() || null : null;
  return {
    query: normalizeSearchQuery(input.query),
    threshold: input.threshold,
    sort: 'relevance',
    direction: 'desc',
    favoriteOnly: input.favoriteOnly ?? false,
    tagId: normalizedTagId,
    limit: input.limit,
  };
}

export function encodeVectorSearchCursor(cursor: Omit<VectorSearchCursor, 'version'>): string {
  return Buffer.from(JSON.stringify({ version: 2, ...cursor })).toString('base64url');
}

export function decodeVectorSearchCursor(value: string): VectorSearchCursor | null {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as VectorSearchCursor;
    const context = cursor.context;
    if (cursor.version !== 2 || cursor.order !== 'relevance' ||
        typeof cursor.id !== 'string' || cursor.id.length === 0 || cursor.id.length > 200 ||
        typeof cursor.distance !== 'number' || !Number.isFinite(cursor.distance) ||
        !context || typeof context !== 'object' ||
        typeof context.query !== 'string' || context.query !== normalizeSearchQuery(context.query) ||
        typeof context.threshold !== 'number' || !Number.isFinite(context.threshold) ||
        context.threshold < 0 || context.threshold > 1 ||
        context.sort !== 'relevance' || context.direction !== 'desc' ||
        typeof context.favoriteOnly !== 'boolean' ||
        (context.tagId !== null && (typeof context.tagId !== 'string' || context.tagId.length === 0)) ||
        !Number.isSafeInteger(context.limit) || context.limit < 1 || context.limit > SEARCH_MAX_LIMIT) {
      return null;
    }
    return cursor;
  } catch {
    return null;
  }
}

export function vectorSearchCursorMatchesContext(
  cursor: VectorSearchCursor,
  context: VectorSearchContext,
): boolean {
  return cursor.context.query === context.query &&
    cursor.context.threshold === context.threshold &&
    cursor.context.sort === context.sort &&
    cursor.context.direction === context.direction &&
    cursor.context.favoriteOnly === context.favoriteOnly &&
    cursor.context.tagId === context.tagId &&
    cursor.context.limit === context.limit;
}

/** Semantic search is always relevance-first; gallery shuffle belongs to /api/assets. */
export function vectorSearchOrderClause(): Prisma.Sql {
  return Prisma.sql`ORDER BY ranked.distance DESC, ranked.id ASC`;
}

export async function vectorSearchPage(
  userId: string,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    threshold?: number;
    favoriteOnly?: boolean;
    tagId?: string | null;
    offset?: number;
    cursor?: string;
    cursorContext?: VectorSearchContext;
  }
): Promise<VectorSearchPage> {
  const {
    limit = 30,
    threshold,
    favoriteOnly = false,
    tagId = null,
    offset = 0,
    cursor: cursorValue,
    cursorContext,
  } = options || {};
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new Error(`vector search page limit must be between 1 and ${SEARCH_MAX_LIMIT}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500) {
    throw new Error('vector search offset must be between 0 and 500; use a cursor for later pages');
  }

  if (cursorValue && cursorValue.length > SEARCH_MAX_CURSOR_LENGTH) {
    throw new Error('vector search cursor is invalid');
  }
  const cursor = cursorValue ? decodeVectorSearchCursor(cursorValue) : null;
  if (cursorValue && !cursor) throw new Error('vector search cursor is invalid');
  if (cursor && offset > 0) throw new Error('vector search cursor cannot be combined with offset');
  if (cursor && (!cursorContext || !vectorSearchCursorMatchesContext(cursor, cursorContext))) {
    throw new Error(VECTOR_SEARCH_CURSOR_CONTEXT_ERROR);
  }

  if (!prisma) {
    return { results: [], total: 0, hasMore: false };
  }

  const vectorSql = embeddingVectorSql(queryEmbedding, 'search query embedding');
  const thresholdClause = typeof threshold === 'number' && threshold > 0
    ? Prisma.sql`AND 1 - (ae.image_embedding <=> ${vectorSql}) >= ${threshold}`
    : Prisma.empty;
  const favoriteClause = favoriteOnly
    ? Prisma.sql`AND a.favorite = true`
    : Prisma.empty;
  const tagClause = tagId
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM "asset_tags" at
          WHERE at.asset_id = a.id AND at.tag_id = ${tagId}
        )
      `
    : Prisma.empty;
  const orderClause = vectorSearchOrderClause();
  const rankedCte = Prisma.sql`
    WITH ranked AS (
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
        ${favoriteClause}
        ${tagClause}
        ${thresholdClause}
    )
  `;

  try {
    // The ranked CTE owns the complete result set, while page applies a
    // bounded keyset/legacy page before rows cross into application memory.
    // The scalar count remains truthful when a cursor has already advanced.
    const cursorClause = cursor
      ? Prisma.sql`
          WHERE ranked.distance < ${cursor.distance}
             OR (ranked.distance = ${cursor.distance} AND ranked.id > ${cursor.id})
        `
      : Prisma.empty;
    const pageOrderClause = Prisma.sql`ORDER BY page.distance DESC, page.id ASC`;
    const rows = await prisma.$queryRaw<Array<VectorSearchRow & { total_count: bigint | number }>>(Prisma.sql`
      ${rankedCte}
      , page AS (
        SELECT ranked.*
        FROM ranked
        ${cursorClause}
        ${orderClause}
        LIMIT ${limit + 1} OFFSET ${cursor ? 0 : offset}
      )
      SELECT page.*, (SELECT COUNT(*) FROM ranked) AS total_count
      FROM page
      ${pageOrderClause}
    `);

    let total = Number(rows[0]?.total_count ?? 0);
    if (rows.length === 0) {
      const countRows = await prisma.$queryRaw<Array<{ total_count: bigint | number }>>(Prisma.sql`
        ${rankedCte}
        SELECT COUNT(*) AS total_count FROM ranked
      `);
      total = Number(countRows[0]?.total_count ?? 0);
    }
    const results = rows
      .filter((row) => row.id !== null && row.id !== undefined)
      .slice(0, limit)
      .map(({ total_count: _totalCount, ...row }) => row);
    // A cursor query starts at an arbitrary point in the ordered set, so its
    // page length cannot be compared with the global total. The +1 probe is
    // the authoritative continuation signal for keyset pages; legacy offset
    // pages retain the total-based check.
    const hasMore = cursor
      ? rows.length > limit
      : rows.length > limit || offset + results.length < total;
    const last = results.at(-1);
    const nextCursor = hasMore && last && cursorContext
      ? encodeVectorSearchCursor({ order: 'relevance', id: last.id, distance: last.distance, context: cursorContext })
      : undefined;

    return { results, total, hasMore, ...(nextCursor ? { nextCursor } : {}) };
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

export async function vectorSearch(
  userId: string,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    threshold?: number;
    favoriteOnly?: boolean;
    tagId?: string | null;
    offset?: number;
    cursor?: string;
    cursorContext?: VectorSearchContext;
  }
) {
  const page = await vectorSearchPage(userId, queryEmbedding, options);
  return page.results;
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
