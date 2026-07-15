import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import {
  isAssetSortBy,
  isValidMimeType,
  isValidFileSize,
} from "@sploot/common";
import { createEmbeddingService, EmbeddingError } from "@/lib/embeddings";
import crypto from "crypto";
import { getCacheService } from "@/lib/cache";
import { getAuthWithUser, requireUserIdWithSync } from "@/lib/auth/server";
import { isUnauthorizedAuthError, unauthorizedResponse } from "@/lib/auth/api";
import { prisma, upsertAssetEmbedding } from "@/lib/db";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { logError } from "@/lib/observability-logger";
import { createErrorResponse } from "@/lib/error-response";
import { withObservability } from "@/lib/with-observability";
import { logger as observabilityLogger } from "@/lib/observability-logger";
import { getDbFingerprint } from "@/lib/db-fingerprint";
import { getRuntimeGate, runtimeGateResponse } from "@/lib/runtime-gates";
import {
  releaseStorageQuotaReservation,
  reserveUploadBytes,
  storageQuotaError,
  StorageQuotaExceededError,
} from "@/lib/quota/storage-quota-policy";
import {
  getTasteWeightedAssets,
  MIN_TASTE_BANGER_EMBEDDINGS,
} from "@/lib/taste/taste-engine";
import {
  normalizeAssetToGridDto,
} from "@/lib/asset-grid-dto";
import type {
  AssetGridCamelSource,
  AssetListResponse,
  AssetGridTasteScoreExtension,
  AssetUploadCreatedResponse,
  AssetUploadDuplicateResponse,
} from "@/lib/types";

// Shuffle seed range: 0-1000000 for user-friendly integer values
// Asset shuffle keys are stable signed BIGINT values.
const MAX_SHUFFLE_SEED = 1000000;
const MAX_SHUFFLE_KEY = BigInt("9223372036854775807");
const SHUFFLE_KEY_MASK = MAX_SHUFFLE_KEY;
const MIN_ASSET_LIMIT = 1;
const MAX_ASSET_LIMIT = 100;

function parseUnsignedIntegerParam(
  value: string | null,
  defaultValue: number,
): number | null {
  if (value === null) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function createAssetShuffleKey(): bigint {
  // Keep the sign bit clear so values always fit PostgreSQL BIGINT.
  return crypto.randomBytes(8).readBigUInt64BE(0) & SHUFFLE_KEY_MASK;
}

function shuffleSeedToPivot(seed: number): bigint {
  return (BigInt(seed) * MAX_SHUFFLE_KEY) / BigInt(MAX_SHUFFLE_SEED);
}

type AssetListRow = AssetGridCamelSource & Partial<AssetGridTasteScoreExtension>;

type ShuffleQueryOptions = {
  userId: string;
  favorite: string | null;
  tagId: string | null;
  pivot: bigint;
  limit: number;
  offset: number;
};

function shuffleFilterSql(
  options: Pick<ShuffleQueryOptions, "userId" | "favorite" | "tagId">,
) {
  return Prisma.sql`
    a.owner_user_id = ${options.userId}
    AND a.deleted_at IS NULL
    ${options.favorite !== null ? Prisma.sql`AND a.favorite = ${options.favorite === "true"}` : Prisma.empty}
    ${
      options.tagId
        ? Prisma.sql`AND EXISTS (
      SELECT 1 FROM "asset_tags" at
      WHERE at.asset_id = a.id AND at.tag_id = ${options.tagId}
    )`
        : Prisma.empty
    }
  `;
}

async function countShuffleTail(options: ShuffleQueryOptions): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint as count
    FROM "assets" a
    WHERE
      ${shuffleFilterSql(options)}
      AND a.shuffle_key >= ${options.pivot}
  `;

  return Number(rows[0]?.count ?? 0);
}

async function fetchShuffleSegment(
  options: ShuffleQueryOptions & {
    direction: "tail" | "head";
    segmentOffset: number;
    segmentLimit: number;
  },
): Promise<AssetListRow[]> {
  if (options.segmentLimit <= 0) {
    return [];
  }

  return prisma.$queryRaw<AssetListRow[]>`
    WITH picked_assets AS (
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
        a."createdAt",
        a.shuffle_key
      FROM "assets" a
      WHERE
        ${shuffleFilterSql(options)}
        ${
          options.direction === "tail"
            ? Prisma.sql`AND a.shuffle_key >= ${options.pivot}`
            : Prisma.sql`AND a.shuffle_key < ${options.pivot}`
        }
      ORDER BY a.shuffle_key ASC, a.id ASC
      LIMIT ${options.segmentLimit}
      OFFSET ${options.segmentOffset}
    )
    SELECT
      a.id,
      a.blob_url as "blobUrl",
      a.thumbnail_url as "thumbnailUrl",
      a.pathname,
      a.mime,
      a.width,
      a.height,
      a.favorite,
      a.size,
      a."createdAt"
    FROM picked_assets a
    ORDER BY a.shuffle_key ASC, a.id ASC
  `;
}

async function fetchSeededShuffleAssets(
  options: ShuffleQueryOptions,
): Promise<AssetListRow[]> {
  const tailCount = await countShuffleTail(options);

  if (options.offset >= tailCount) {
    return fetchShuffleSegment({
      ...options,
      direction: "head",
      segmentOffset: options.offset - tailCount,
      segmentLimit: options.limit,
    });
  }

  const tailRows = await fetchShuffleSegment({
    ...options,
    direction: "tail",
    segmentOffset: options.offset,
    segmentLimit: options.limit,
  });

  if (tailRows.length >= options.limit) {
    return tailRows;
  }

  const headRows = await fetchShuffleSegment({
    ...options,
    direction: "head",
    segmentOffset: 0,
    segmentLimit: options.limit - tailRows.length,
  });

  return [...tailRows, ...headRows];
}

async function postHandler(req: NextRequest) {
  const requestId = crypto.randomUUID();
  let quotaReservationId: string | null = null;

  try {
    const userId = await requireUserIdWithSync();

    const uploadGate = getRuntimeGate("uploads");
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
        {
          error:
            "Missing required parameters: blobUrl, pathname, filename, mimeType, size",
        },
        { status: 400 },
      );
    }

    if (!isValidMimeType(mimeType)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.",
        },
        { status: 400 },
      );
    }

    if (!isValidFileSize(size)) {
      return NextResponse.json(
        { error: "File size must be between 1 byte and 10MB" },
        { status: 400 },
      );
    }

    const checksumSha256 = checksum || crypto.randomBytes(32).toString("hex");

    if (!prisma) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
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
      const responseBody: AssetUploadDuplicateResponse = {
        asset: normalizeAssetToGridDto(existingAsset),
        message: "Asset already exists",
        duplicate: true,
      };
      return NextResponse.json(responseBody, { status: 200 });
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
        shuffleKey: createAssetShuffleKey(),
      },
      include: {
        embedding: { select: { status: true } },
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
    let embeddingStatus = "pending";

    const embeddingGate = getRuntimeGate("embeddings");
    if (!embeddingGate.enabled) {
      embeddingStatus = "unavailable";
    } else {
      try {
        const embeddingService = createEmbeddingService(userId);

        // Start embedding generation in background
        generateEmbeddingAsync(
          asset.id,
          blobUrl,
          checksumSha256,
          embeddingService,
        ).catch((error) => {
          // Failed to generate embedding
        });

        embeddingStatus = "processing";
      } catch (error) {
        // Embedding service not configured - continue without embeddings
        // Embedding service not available
        embeddingStatus = "unavailable";
      }
    }

    // Invalidate cache after creating new asset
    // Clear only asset and search caches (preserve embeddings)
    const cache = getCacheService();
    await cache.clear("assets");
    await cache.clear("search");

    const responseBody: AssetUploadCreatedResponse = {
      asset: normalizeAssetToGridDto(asset as any, {
        filename: asset.pathname ?? undefined,
        embeddingStatus: embeddingStatus ?? undefined,
        tags: {
          tags: asset.tags.map((at) => ({ id: at.tag.id, name: at.tag.name })),
        },
      }),
      message: "Asset created successfully",
    };
    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    await releaseStorageQuotaReservation(quotaReservationId);

    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(storageQuotaError(error.snapshot), {
        status: 403,
      });
    }

    unstable_rethrow(error);
    logError("POST /api/assets", error, { requestId });
    return createErrorResponse(
      "Failed to create asset",
      requestId,
      req,
      error instanceof Error ? error.message : undefined,
    );
  }
}

async function getHandler(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const fp = getDbFingerprint();

  // Declare params outside try block so they're accessible in catch for logging
  let limit = 50;
  let offset = 0;
  let sortBy: "createdAt" | "updatedAt" | "size" | "pathname" | "shuffle" | "taste" =
    "createdAt";
  let sortOrder: "asc" | "desc" = "desc";
  let favorite: string | null = null;
  let tagId: string | null = null;
  let shuffleSeed: number | undefined = undefined;
  let includeTags = false;

  try {
    // Get auth with explicit sync status before validating request details so
    // signed-out callers consistently receive the auth contract.
    const { userId, syncStatus, syncError } = await getAuthWithUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if database sync failed (prevents empty gallery bug)
    if (syncStatus === "failed") {
      return NextResponse.json(
        {
          error: "Account sync in progress. Please refresh in a few seconds.",
          retry: true,
          // Include error details in development only
          ...(process.env.NODE_ENV === "development" && {
            details: syncError,
            syncStatus,
          }),
        },
        { status: 503 },
      );
    }

    // Parse query params INSIDE try block to catch URL parsing errors
    const { searchParams } = new URL(req.url);
    const parsedLimit = parseUnsignedIntegerParam(
      searchParams.get("limit"),
      50,
    );
    const parsedOffset = parseUnsignedIntegerParam(
      searchParams.get("offset"),
      0,
    );

    if (
      parsedLimit === null ||
      parsedLimit < MIN_ASSET_LIMIT ||
      parsedLimit > MAX_ASSET_LIMIT
    ) {
      return NextResponse.json(
        {
          error: `Invalid limit parameter. Must be integer ${MIN_ASSET_LIMIT}-${MAX_ASSET_LIMIT}.`,
        },
        { status: 400 },
      );
    }

    if (parsedOffset === null) {
      return NextResponse.json(
        { error: "Invalid offset parameter. Must be a non-negative integer." },
        { status: 400 },
      );
    }

    limit = parsedLimit;
    offset = parsedOffset;

    const sortByParam = searchParams.get("sortBy") || "createdAt";
    if (!isAssetSortBy(sortByParam)) {
      return NextResponse.json(
        {
          error:
            "Invalid sortBy parameter. Must be one of: createdAt, updatedAt, size, pathname, shuffle, taste.",
        },
        { status: 400 },
      );
    }

    sortBy = sortByParam;
    const isShuffle = sortByParam === "shuffle";
    const isTaste = sortByParam === "taste";

    // Validate and type-cast sortOrder to Prisma's expected literal type
    const sortOrderParam = searchParams.get("sortOrder") || "desc";
    sortOrder = sortOrderParam === "asc" ? "asc" : "desc";

    // Parse and validate shuffleSeed
    const shuffleSeedParam = searchParams.get("shuffleSeed");
    if (isShuffle && !shuffleSeedParam) {
      return NextResponse.json(
        { error: "shuffleSeed is required when sortBy=shuffle." },
        { status: 400 },
      );
    }

    if (!isShuffle && shuffleSeedParam) {
      return NextResponse.json(
        { error: "shuffleSeed is only supported when sortBy=shuffle." },
        { status: 400 },
      );
    }

    if (shuffleSeedParam) {
      const parsed = parseUnsignedIntegerParam(shuffleSeedParam, 0);
      if (parsed === null || parsed > MAX_SHUFFLE_SEED) {
        return NextResponse.json(
          {
            error: `Invalid shuffleSeed parameter. Must be integer 0-${MAX_SHUFFLE_SEED}.`,
          },
          { status: 400 },
        );
      }
      shuffleSeed = parsed;
    }

    favorite = searchParams.get("favorite");
    tagId = searchParams.get("tagId");
    // Auto-enable includeTags when filtering by tagId so UI can display tag names
    includeTags = searchParams.get("includeTags") === "true" || !!tagId;

    const where = {
      ownerUserId: userId,
      deletedAt: null,
      ...(favorite !== null && { favorite: favorite === "true" }),
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
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const shufflePivot =
      shuffleSeed !== undefined ? shuffleSeedToPivot(shuffleSeed) : null;

    const tasteResult = isTaste
      ? await getTasteWeightedAssets({
          userId,
          favorite,
          tagId,
          limit,
          offset,
        })
      : null;

    const assetsPromise: Promise<AssetListRow[]> = tasteResult
      ? Promise.resolve(tasteResult.assets)
      : shuffleSeed !== undefined
        ? fetchSeededShuffleAssets({
            userId,
            favorite,
            tagId,
            pivot: shufflePivot!,
            limit,
            offset,
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
              thumbnailUrl: true,
              pathname: true,
              mime: true,
              width: true,
              height: true,
              favorite: true,
              size: true,
              createdAt: true,
            },
          });

    const [assets, total] = await Promise.all([
      assetsPromise,
      tasteResult ? Promise.resolve(tasteResult.total) : prisma.asset.count({ where }),
    ]);

    let tagsByAssetId: Record<string, Array<{ id: string; name: string }>> = {};

    if (includeTags && assets.length > 0) {
      const assetIds = assets.map((asset) => asset.id);
      const tagRows = await prisma!.assetTag.findMany({
        where: { assetId: { in: assetIds } },
        select: {
          assetId: true,
          tag: { select: { id: true, name: true } },
        },
      });

      tagsByAssetId = tagRows.reduce(
        (acc: Record<string, Array<{ id: string; name: string }>>, row) => {
          if (!acc[row.assetId]) acc[row.assetId] = [];
          acc[row.assetId].push({ id: row.tag.id, name: row.tag.name });
          return acc;
        },
        {},
      );
    }

    const formattedAssets = assets.map((asset) =>
      normalizeAssetToGridDto(asset as any, {
        filename: asset.pathname ?? undefined,
        tags: {
          tags: includeTags ? tagsByAssetId[asset.id] || [] : [],
        },
        embeddingStatus: asset.embeddingStatus ?? undefined,
      }),
    ).map((asset, index) => {
      const source = assets[index];
      return typeof source.tasteScore === "number"
        ? { ...asset, tasteScore: Number(source.tasteScore.toFixed(3)) }
        : asset;
    });

    // Drift detector: zero assets for known user hints at wrong DB branch
    if (total === 0 && !isTaste) {
      try {
        observabilityLogger.logError("assets:zero-count", new Error("zero assets for user"), {
          userId,
          dbHost: fp.host || "unknown",
          migrationHash: fp.hash,
          suspect: "db-drift",
        });
        logger.warn("assets:zero-count", {
          userId,
          dbHost: fp.host,
          migrationHash: fp.hash,
        });
      } catch {
        // best-effort only
      }
    }

    const responseBody: AssetListResponse = {
        assets: formattedAssets,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
        ...(tasteResult
          ? {
              taste: {
                status: tasteResult.status,
                embeddedBangerCount: tasteResult.embeddedBangerCount,
                minimumBangerEmbeddings: MIN_TASTE_BANGER_EMBEDDINGS,
              },
            }
          : {}),
    };
    const res = NextResponse.json(
      responseBody,
      {
        headers: {
          "x-env-fingerprint": `${fp.host || "unknown"}@${fp.hash}`,
        },
      },
    );
    return res;
  } catch (error) {
    unstable_rethrow(error);
    logError("GET /api/assets", error, {
      requestId,
      params: { limit, offset, sortBy, sortOrder, favorite, tagId },
    });
    return createErrorResponse(
      "Failed to fetch assets",
      requestId,
      req,
      error instanceof Error ? error.message : undefined,
    );
  }
}

export const POST = withObservability(postHandler, {
  operation: "assets:create",
});

export const GET = withObservability(getHandler, { operation: "assets:list" });

// Async function to generate embeddings without blocking the upload
async function generateEmbeddingAsync(
  assetId: string,
  imageUrl: string,
  checksum: string,
  embeddingService: any,
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
