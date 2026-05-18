import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { isValidFileType, isValidFileSize } from '@/lib/blob';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import crypto from 'crypto';
import { getCacheService } from '@/lib/cache';
import { getAuthWithUser, requireUserIdWithSync } from '@/lib/auth/server';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { isAssetSortBy } from '@sploot/common';
import logger from '@/lib/logger';
import { logError } from '@/lib/vercel-logger';
import { createErrorResponse } from '@/lib/error-response';
import { withObservability } from '@/lib/with-observability';
import { getDbFingerprint } from '@/lib/db-fingerprint';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import {
  releaseStorageQuotaReservation,
  reserveUploadBytes,
  storageQuotaError,
  StorageQuotaExceededError,
} from '@/lib/quota/storage-quota-policy';

// Shuffle seed range: 0-1000000 for user-friendly integer values
// Normalized to 0.0-1.0 for PostgreSQL setseed() in shuffle queries
const MAX_SHUFFLE_SEED = 1000000;
const MIN_ASSET_LIMIT = 1;
const MAX_ASSET_LIMIT = 100;

function parseUnsignedIntegerParam(value: string | null, defaultValue: number): number | null {
  if (value === null) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function postHandler(req: NextRequest) {
  const requestId = crypto.randomUUID();
  let quotaReservationId: string | null = null;

  try {
    const userId = await requireUserIdWithSync();

    const uploadGate = getRuntimeGate('uploads');
    if (!uploadGate.enabled) {
      return runtimeGateResponse(uploadGate);
    }

    const body = await req.json();
    const {
      blobUrl,
      pathname,
      filename,
      mimeType,
      size,
      checksum,
      width,
      height,
    } = body;

    if (!blobUrl || !pathname || !filename || !mimeType || !size) {
      return NextResponse.json(
        { error: 'Missing required parameters: blobUrl, pathname, filename, mimeType, size' },
        { status: 400 }
      );
    }

    if (!isValidFileType(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.' },
        { status: 400 }
      );
    }

    if (!isValidFileSize(size)) {
      return NextResponse.json(
        { error: 'File size must be between 1 byte and 10MB' },
        { status: 400 }
      );
    }

    const checksumSha256 = checksum || crypto.randomBytes(32).toString('hex');

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const existingAsset = await prisma.asset.findFirst({
      where: {
        ownerUserId: userId,
        checksumSha256: checksumSha256,
        deletedAt: null,
      },
    });

    if (existingAsset) {
      return NextResponse.json({
        asset: {
          id: existingAsset.id,
          blobUrl: existingAsset.blobUrl,
          pathname: existingAsset.pathname,
          filename: existingAsset.pathname.split('/').pop() || existingAsset.pathname,
          mime: existingAsset.mime,
          size: existingAsset.size,
          width: existingAsset.width,
          height: existingAsset.height,
          favorite: existingAsset.favorite,
          createdAt: existingAsset.createdAt,
        },
        message: 'Asset already exists',
        duplicate: true,
      });
    }

    const quotaReservation = await reserveUploadBytes(userId, size);
    quotaReservationId = quotaReservation.id;

    const asset = await prisma.asset.create({
      data: {
        ownerUserId: userId,
        blobUrl,
        pathname,
        mime: mimeType,
        size,
        checksumSha256,
        width: width || null,
        height: height || null,
        favorite: false,
      },
      include: {
        embedding: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });
    await releaseStorageQuotaReservation(quotaReservationId);
    quotaReservationId = null;

    // Generate embedding asynchronously (non-blocking)
    let embeddingStatus = 'pending';
    let embeddingError = null;

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      embeddingStatus = 'unavailable';
      embeddingError = embeddingGate.message;
    } else {
      try {
        const embeddingService = createEmbeddingService();

        // Start embedding generation in background
        generateEmbeddingAsync(asset.id, blobUrl, checksumSha256, embeddingService).catch(error => {
          // Failed to generate embedding
        });

        embeddingStatus = 'processing';
      } catch (error) {
        // Embedding service not configured - continue without embeddings
        // Embedding service not available
        embeddingStatus = 'unavailable';
        embeddingError = error instanceof EmbeddingError ? error.message : 'Embedding service not configured';
      }
    }

    // Invalidate cache after creating new asset
    // Clear only asset and search caches (preserve embeddings)
    const cache = getCacheService();
    await cache.clear('assets');
    await cache.clear('search');

    return NextResponse.json({
      asset: {
        id: asset.id,
        blobUrl: asset.blobUrl,
        pathname: asset.pathname,
        filename: asset.pathname,
        mime: asset.mime,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        favorite: asset.favorite,
        createdAt: asset.createdAt,
        embedding: asset.embedding,
        embeddingStatus,
        embeddingError,
        tags: asset.tags.map((at: any) => ({
          id: at.tag.id,
          name: at.tag.name,
        })),
      },
      message: 'Asset created successfully',
    });
  } catch (error) {
    await releaseStorageQuotaReservation(quotaReservationId);

    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(storageQuotaError(error.snapshot), { status: 403 });
    }

    unstable_rethrow(error);
    logError('POST /api/assets', error, { requestId });
    return createErrorResponse(
      'Failed to create asset',
      requestId,
      req,
      error instanceof Error ? error.message : undefined
    );
  }
}

async function getHandler(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const fp = getDbFingerprint();

  // Declare params outside try block so they're accessible in catch for logging
  let limit = 50;
  let offset = 0;
  let sortBy: 'createdAt' | 'updatedAt' | 'size' | 'pathname' | 'shuffle' = 'createdAt';
  let sortOrder: 'asc' | 'desc' = 'desc';
  let favorite: string | null = null;
  let tagId: string | null = null;
  let shuffleSeed: number | undefined = undefined;
  let includeTags = false;

  try {
    // Get auth with explicit sync status before validating request details so
    // signed-out callers consistently receive the auth contract.
    const { userId, syncStatus, syncError } = await getAuthWithUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if database sync failed (prevents empty gallery bug)
    if (syncStatus === 'failed') {
      return NextResponse.json(
        {
          error: 'Account sync in progress. Please refresh in a few seconds.',
          retry: true,
          // Include error details in development only
          ...(process.env.NODE_ENV === 'development' && {
            details: syncError,
            syncStatus,
          }),
        },
        { status: 503 }
      );
    }

    // Parse query params INSIDE try block to catch URL parsing errors
    const { searchParams } = new URL(req.url);
    const parsedLimit = parseUnsignedIntegerParam(searchParams.get('limit'), 50);
    const parsedOffset = parseUnsignedIntegerParam(searchParams.get('offset'), 0);

    if (parsedLimit === null || parsedLimit < MIN_ASSET_LIMIT || parsedLimit > MAX_ASSET_LIMIT) {
      return NextResponse.json(
        { error: `Invalid limit parameter. Must be integer ${MIN_ASSET_LIMIT}-${MAX_ASSET_LIMIT}.` },
        { status: 400 }
      );
    }

    if (parsedOffset === null) {
      return NextResponse.json(
        { error: 'Invalid offset parameter. Must be a non-negative integer.' },
        { status: 400 }
      );
    }

    limit = parsedLimit;
    offset = parsedOffset;

    const sortByParam = searchParams.get('sortBy') || 'createdAt';
    if (!isAssetSortBy(sortByParam)) {
      return NextResponse.json(
        { error: 'Invalid sortBy parameter. Must be one of: createdAt, updatedAt, size, pathname, shuffle.' },
        { status: 400 }
      );
    }

    sortBy = sortByParam;
    const isShuffle = sortByParam === 'shuffle';

    // Validate and type-cast sortOrder to Prisma's expected literal type
    const sortOrderParam = searchParams.get('sortOrder') || 'desc';
    sortOrder = sortOrderParam === 'asc' ? 'asc' : 'desc';

    // Parse and validate shuffleSeed
    const shuffleSeedParam = searchParams.get('shuffleSeed');
    if (isShuffle && !shuffleSeedParam) {
      return NextResponse.json(
        { error: 'shuffleSeed is required when sortBy=shuffle.' },
        { status: 400 }
      );
    }

    if (!isShuffle && shuffleSeedParam) {
      return NextResponse.json(
        { error: 'shuffleSeed is only supported when sortBy=shuffle.' },
        { status: 400 }
      );
    }

    if (shuffleSeedParam) {
      const parsed = parseUnsignedIntegerParam(shuffleSeedParam, 0);
      if (parsed === null || parsed > MAX_SHUFFLE_SEED) {
        return NextResponse.json(
          { error: `Invalid shuffleSeed parameter. Must be integer 0-${MAX_SHUFFLE_SEED}.` },
          { status: 400 }
        );
      }
      shuffleSeed = parsed;
    }

    favorite = searchParams.get('favorite');
    tagId = searchParams.get('tagId');
    // Auto-enable includeTags when filtering by tagId so UI can display tag names
    includeTags = searchParams.get('includeTags') === 'true' || !!tagId;

    const where = {
      ownerUserId: userId,
      deletedAt: null,
      ...(favorite !== null && { favorite: favorite === 'true' }),
      ...(tagId && {
        tags: {
          some: {
            tagId: tagId,
          },
        },
      }),
    };

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Normalize seed to 0-1 range for PostgreSQL setseed()
    // PostgreSQL setseed() requires seed in range [0.0, 1.0]
    // Client generates seeds 0-MAX_SHUFFLE_SEED for user-friendly integers (no decimals)
    // Normalize: 0 → 0.0, 500000 → 0.5, MAX_SHUFFLE_SEED → 1.0
    const normalizedSeed = shuffleSeed !== undefined ? shuffleSeed / MAX_SHUFFLE_SEED : null;

    const [assets, total] = await Promise.all([
      shuffleSeed !== undefined
        ? // Use transaction to ensure setseed() and query run on same connection
          // Field selection: Includes embedding data via LEFT JOIN
          // Tag data excluded since shuffle uses raw SQL
          prisma.$transaction(async (tx) => {
            // Set the random seed first
            await tx.$executeRaw`SELECT setseed(${normalizedSeed})`;

            // Then execute the shuffle query on the same connection
            const results = await tx.$queryRaw<Array<{
              id: string;
              blobUrl: string;
              pathname: string;
              mime: string;
              width: number | null;
              height: number | null;
              favorite: boolean;
              size: number;
              createdAt: Date;
              updatedAt: Date;
              embeddingId: string | null;
              embeddingModelName: string | null;
              embeddingModelVersion: string | null;
              embeddingStatus: string | null;
              embeddingCreatedAt: Date | null;
            }>>`
              SELECT
                a.id,
                a.blob_url as "blobUrl",
                a.pathname,
                a.mime,
                a.width,
                a.height,
                a.favorite,
                a.size,
                a."createdAt",
                a."updatedAt",
                ae.asset_id as "embeddingId",
                ae.model_name as "embeddingModelName",
                ae.model_version as "embeddingModelVersion",
                ae.status as "embeddingStatus",
                ae."createdAt" as "embeddingCreatedAt"
              FROM "assets" a
              LEFT JOIN "asset_embeddings" ae ON ae.asset_id = a.id
              WHERE
                a.owner_user_id = ${userId}
                AND a.deleted_at IS NULL
                ${favorite !== null ? Prisma.sql`AND a.favorite = ${favorite === 'true'}` : Prisma.empty}
                ${tagId ? Prisma.sql`AND EXISTS (
                  SELECT 1 FROM "asset_tags" at
                  WHERE at.asset_id = a.id AND at.tag_id = ${tagId}
                )` : Prisma.empty}
              ORDER BY RANDOM()
              LIMIT ${limit}
              OFFSET ${offset}
            `;

            return results;
          })
        : // Normal query with Prisma ORM
          prisma.asset.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy: { [sortBy]: sortOrder },
            select: {
              id: true,
              blobUrl: true,
              pathname: true,
              mime: true,
              width: true,
              height: true,
              favorite: true,
              size: true,
              createdAt: true,
              embedding: {
                select: {
                  status: true,
                  modelName: true,
                  modelVersion: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          }),
      prisma.asset.count({ where }),
    ]);

    let tagsByAssetId: Record<string, Array<{ id: string; name: string }>> = {};

    if (includeTags && assets.length > 0) {
      const assetIds = assets.map((asset: any) => asset.id);
      const tagRows = await prisma!.assetTag.findMany({
        where: { assetId: { in: assetIds } },
        select: {
          assetId: true,
          tag: { select: { id: true, name: true } },
        },
      });

      tagsByAssetId = tagRows.reduce((acc: Record<string, Array<{ id: string; name: string }>>, row) => {
        if (!acc[row.assetId]) acc[row.assetId] = [];
        acc[row.assetId].push({ id: row.tag.id, name: row.tag.name });
        return acc;
      }, {});
    }

    const formattedAssets = assets.map((asset: any) => ({
      id: asset.id,
      blobUrl: asset.blobUrl,
      pathname: asset.pathname,
      filename: asset.pathname,
      mime: asset.mime,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      favorite: asset.favorite,
      createdAt: asset.createdAt,
      // Format embedding data for both shuffle and normal queries without vector payload
      embedding: asset.embedding || (asset.embeddingId ? {
        assetId: asset.embeddingId,
        modelName: asset.embeddingModelName,
        modelVersion: asset.embeddingModelVersion,
        createdAt: asset.embeddingCreatedAt,
      } : undefined),
      embeddingStatus: asset.embeddingStatus || asset.embedding?.status,
      ...(includeTags ? {
        tags: tagsByAssetId[asset.id] || [],
      } : {}),
    }));

    // Drift detector: zero assets for known user hints at wrong DB branch
    if (total === 0) {
      try {
        const Sentry = await import('@sentry/nextjs');
        Sentry.captureMessage('zero-assets-for-user', {
          level: 'warning',
          tags: {
            userId,
            db_host: fp.host || 'unknown',
            migration_hash: fp.hash,
            suspect: 'db-drift',
          },
        });
        logger.warn('assets:zero-count', {
          userId,
          dbHost: fp.host,
          migrationHash: fp.hash,
        });
      } catch {
        // best-effort only
      }
    }

    const res = NextResponse.json(
      {
        assets: formattedAssets,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
      {
        headers: {
          'x-env-fingerprint': `${fp.host || 'unknown'}@${fp.hash}`,
        },
      }
    );
    return res;
  } catch (error) {
    unstable_rethrow(error);
    logError('GET /api/assets', error, {
      requestId,
      params: { limit, offset, sortBy, sortOrder, favorite, tagId },
    });
    return createErrorResponse(
      'Failed to fetch assets',
      requestId,
      req,
      error instanceof Error ? error.message : undefined
    );
  }
}

export const POST = withObservability(postHandler, { operation: 'assets:create' });

export const GET = withObservability(getHandler, { operation: 'assets:list' });

// Async function to generate embeddings without blocking the upload
async function generateEmbeddingAsync(
  assetId: string,
  imageUrl: string,
  checksum: string,
  embeddingService: any
): Promise<void> {
  if (!prisma) {
    return;
  }

  try {
    // Generate the embedding
    const result = await embeddingService.embedImage(imageUrl, checksum);

    // Check if embedding already exists
    const existingEmbedding = await prisma.assetEmbedding.findUnique({
      where: { assetId },
    });

    await upsertAssetEmbedding({
      assetId,
      modelName: result.model,
      modelVersion: result.model,
      dim: result.dimension,
      embedding: result.embedding,
    });

    // Successfully generated embedding
  } catch (error) {
    // Failed to generate embedding
    // Could update a status field in the asset table to mark embedding as failed
    // For now, we just log the error
  }
}
