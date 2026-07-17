import { NextRequest, NextResponse } from 'next/server';
import { SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';
import { unstable_rethrow } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { buildRankedEmbeddingCte, prisma, logSearch, queryHnswRanked } from '@/lib/db';
import { CLIP_MODEL, createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import {
  EmbeddingConfigurationError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
import { getCacheService } from '@/lib/cache';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { embeddingVectorSql as createEmbeddingVectorSql } from '@/lib/embedding-vector-sql';
import { logError } from '@/lib/observability-logger';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentIdentityConflictResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentIdentityConflictError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';

interface SearchFilters {
  favorites?: boolean;
  mimeTypes?: string[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  minWidth?: number;
  minHeight?: number;
}

async function postHandler(req: NextRequest, _context: unknown, { principal }: AuthenticatedApiContext) {
  const startTime = Date.now();
  let query: string = '';
  let filters: SearchFilters = {};
  let limit: number = 30;
  let offset: number = 0;
  let threshold: number = SEARCH_SIMILARITY_FLOOR;
  let sortBy: string = 'relevance';

  try {
    const userId = principal.userId;

    const body = await req.json();
    ({
      query,
      filters = {} as SearchFilters,
      limit = 30,
      offset = 0,
      threshold = SEARCH_SIMILARITY_FLOOR,
      sortBy = 'relevance', // 'relevance', 'date', 'favorite'
    } = body);

    // Validate pagination bounds to prevent DoS
    const MAX_LIMIT = 100;
    const MAX_OFFSET = 10000;
    limit = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), MAX_LIMIT);
    offset = Math.min(Math.max(0, Math.floor(Number(offset) || 0)), MAX_OFFSET);

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    await assertEnrolledUser(userId, prisma);

    // Get cache service
    const cache = getCacheService();

    // Check cache for advanced search results
    const cacheLookupKey = {
      filters,
      limit,
      offset,
      threshold,
      sortBy,
    };
    const cachedPage = await cache.getSearchResultPage(userId, query, cacheLookupKey, CLIP_MODEL);

    if (cachedPage) {
      // Cache hit preserves the SQL-computed total and page continuation.
      return NextResponse.json({
        results: cachedPage.results,
        query,
        filters,
        sortBy,
        pagination: {
          total: cachedPage.total,
          limit,
          offset,
          hasMore: cachedPage.hasMore ?? offset + limit < cachedPage.total,
        },
        processingTime: Date.now() - startTime,
        embeddingModel: CLIP_MODEL,
        searchType: 'semantic',
        cached: true,
      });
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
    }

    // Typed provider configuration failures flow to the shared
    // EmbeddingError HTTP mapping below; metadata fallback would hide a
    // provider-unavailable outcome as a successful semantic search.
    let embeddingService;
    try {
      embeddingService = createEmbeddingService(userId);
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;

      // Preserve the legacy metadata fallback only for an untyped internal
      // initialization error. Real provider/admission errors stay typed and
      // reach the shared 429/503 mapping below.
      const assets = await performMetadataSearch(userId, query, filters, limit, offset);

      return NextResponse.json({
        results: assets,
        query,
        total: assets.length,
        limit,
        offset,
        processingTime: Date.now() - startTime,
        searchType: 'metadata',
        error: 'Semantic search unavailable. Showing filename matches.',
      });
    }

    // Generate text embedding
    const embeddingResult = await embeddingService.embedText(query);

    let embeddingVectorSql: Prisma.Sql;
    try {
      embeddingVectorSql = createEmbeddingVectorSql(
        embeddingResult.embedding,
        'advanced search query embedding'
      );
    } catch (error) {
      logError('advanced-search:invalid-query-embedding', error, {
        embeddingLength: Array.isArray(embeddingResult.embedding)
          ? embeddingResult.embedding.length
          : 'invalid',
      });
      return NextResponse.json(
        { error: 'Invalid embedding format from service' },
        { status: 500 }
      );
    }

    // Build parameterized query using Prisma.sql to prevent SQL injection
    // All user inputs are properly parameterized

    // Validate and sanitize filter inputs
    const validatedMimeTypes = filters.mimeTypes?.filter(
      (m): m is string => typeof m === 'string' && m.length > 0 && m.length < 100
    ) || [];
    const validatedTags = filters.tags?.filter(
      (tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length < 100
    ) || [];
    const tagClause = validatedTags.length > 0
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM "asset_tags" at
            INNER JOIN "tags" t ON t.id = at.tag_id
            WHERE at.asset_id = a.id
              AND t.owner_user_id = ${userId}
              AND t.name = ANY(${validatedTags})
          )
        `
      : Prisma.empty;
    // Relevance ranking must apply tag membership inside the owner-scoped
    // candidate scan, otherwise a non-tagged vector can consume the bounded
    // HNSW window before LIMIT/OFFSET is applied.
    const rankedTagClause = validatedTags.length > 0
      ? Prisma.sql`
          AND EXISTS (
            SELECT 1
            FROM "asset_tags" at
            INNER JOIN "tags" t ON t.id = at.tag_id
            WHERE at.asset_id = ae.asset_id
              AND t.owner_user_id = ${userId}
              AND t.name = ANY(${validatedTags})
          )
        `
      : Prisma.empty;

    const validatedDateFrom = filters.dateFrom && isValidISODate(filters.dateFrom)
      ? new Date(filters.dateFrom)
      : null;

    const validatedDateTo = filters.dateTo && isValidISODate(filters.dateTo)
      ? new Date(filters.dateTo)
      : null;

    const validatedMinWidth = typeof filters.minWidth === 'number' && filters.minWidth > 0
      ? Math.floor(filters.minWidth)
      : null;

    const validatedMinHeight = typeof filters.minHeight === 'number' && filters.minHeight > 0
      ? Math.floor(filters.minHeight)
      : null;

    // Validate sortBy to prevent SQL injection in ORDER BY
    const validSortOptions = ['relevance', 'date', 'favorite'] as const;
    const validatedSortBy = validSortOptions.includes(sortBy as any) ? sortBy : 'relevance';

    const orderByClauses: Record<string, Prisma.Sql> = {
      date: Prisma.sql`a."createdAt" DESC, a.id ASC`,
      favorite: Prisma.sql`a.favorite DESC, ae.image_embedding <=> ${embeddingVectorSql} ASC, a.id ASC`,
      relevance: Prisma.sql`ranked.distance ASC, a.id ASC`,
    };
    const orderByClause = orderByClauses[validatedSortBy];
    const usesRankedVectorCte = validatedSortBy === 'relevance';
    let candidateLimit = Math.max(offset + limit + 1, limit + 1);
    const rankedFrom = usesRankedVectorCte
      ? Prisma.sql`FROM ranked INNER JOIN assets a ON a.id = ranked.id`
      : Prisma.sql`FROM assets a INNER JOIN asset_embeddings ae ON a.id = ae.asset_id`;
    const rankedDistance = usesRankedVectorCte
      ? Prisma.sql`ranked.distance`
      : Prisma.sql`ae.image_embedding <=> ${embeddingVectorSql}`;
    const rankedReadyClause = usesRankedVectorCte ? Prisma.empty : Prisma.sql`AND ae.status = 'ready'`;
    const rankedThreshold = usesRankedVectorCte
      ? Prisma.sql`AND 1 - ranked.distance >= ${threshold}`
      : Prisma.sql`AND 1 - (ae.image_embedding <=> ${embeddingVectorSql}) >= ${threshold}`;

    // Execute parameterized search query
    // Using Prisma.sql template literal for safe parameterization
    type AdvancedSearchRow = {
      id: string;
      blob_url: string;
      pathname: string;
      filename: string;
      mime: string;
      size: number;
      width: number | null;
      height: number | null;
      favorite: boolean;
      created_at: Date;
      updated_at: Date;
      similarity: number;
      total_count: bigint;
    };
    const runResultsQuery = (candidateLimitForQuery: number) => {
      const query = Prisma.sql`
      ${usesRankedVectorCte ? buildRankedEmbeddingCte(embeddingVectorSql, candidateLimitForQuery, userId, null, rankedTagClause) : Prisma.empty}
      SELECT
        a.id,
        a.blob_url,
        a.pathname,
        a.pathname AS filename,
        a.mime,
        a.size,
        a.width,
        a.height,
        a.favorite,
        a."createdAt" AS created_at,
        a."updatedAt" AS updated_at,
        1 - ${rankedDistance} as similarity,
        COUNT(*) OVER() as total_count
      ${rankedFrom}
      WHERE a.owner_user_id = ${userId}
        AND a.deleted_at IS NULL
        ${rankedReadyClause}
        ${rankedThreshold}
        ${filters.favorites === true ? Prisma.sql`AND a.favorite = true` : Prisma.empty}
        ${validatedMimeTypes.length > 0 ? Prisma.sql`AND a.mime = ANY(${validatedMimeTypes})` : Prisma.empty}
        ${validatedDateFrom ? Prisma.sql`AND a."createdAt" >= ${validatedDateFrom}` : Prisma.empty}
        ${validatedDateTo ? Prisma.sql`AND a."createdAt" <= ${validatedDateTo}` : Prisma.empty}
        ${validatedMinWidth ? Prisma.sql`AND a.width >= ${validatedMinWidth}` : Prisma.empty}
        ${validatedMinHeight ? Prisma.sql`AND a.height >= ${validatedMinHeight}` : Prisma.empty}
        ${tagClause}
      ORDER BY ${orderByClause}
      LIMIT ${limit}
      OFFSET ${offset}
      `;
      return usesRankedVectorCte
        ? queryHnswRanked<AdvancedSearchRow>(query)
        : prisma!.$queryRaw<AdvancedSearchRow[]>(query);
    };
    let results = await runResultsQuery(candidateLimit);

    if (usesRankedVectorCte) {
      const readyCountRows = await prisma!.$queryRaw<Array<{ ready_count: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS ready_count
        FROM asset_embeddings
        WHERE owner_user_id = ${userId}
          AND asset_deleted_at IS NULL
          AND status = 'ready'
      `);
      const readyCount = Number(readyCountRows[0]?.ready_count ?? 0);
      while (results.length < limit && candidateLimit < readyCount) {
        candidateLimit = Math.min(
          readyCount,
          Math.max(candidateLimit * 2, candidateLimit + limit),
        );
        results = await runResultsQuery(candidateLimit);
      }
    }

    // The ranked CTE deliberately bounds only the vector scan. Keep the
    // published total exact with the same owner/visibility/threshold filters;
    // the page itself remains HNSW-orderable at the CTE boundary. This count
    // also runs for date/favorite sorts and empty pages, where the page query
    // cannot carry a reliable window total after OFFSET.
    const exactTotal = await prisma!.$queryRaw<Array<{ total_count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS total_count
      FROM assets a
      INNER JOIN asset_embeddings ae ON a.id = ae.asset_id
      WHERE a.owner_user_id = ${userId}
        AND a.deleted_at IS NULL
        AND ae.status = 'ready'
        AND 1 - (ae.image_embedding <=> ${embeddingVectorSql}) >= ${threshold}
        ${filters.favorites === true ? Prisma.sql`AND a.favorite = true` : Prisma.empty}
        ${validatedMimeTypes.length > 0 ? Prisma.sql`AND a.mime = ANY(${validatedMimeTypes})` : Prisma.empty}
        ${validatedDateFrom ? Prisma.sql`AND a."createdAt" >= ${validatedDateFrom}` : Prisma.empty}
        ${validatedDateTo ? Prisma.sql`AND a."createdAt" <= ${validatedDateTo}` : Prisma.empty}
        ${validatedMinWidth ? Prisma.sql`AND a.width >= ${validatedMinWidth}` : Prisma.empty}
        ${validatedMinHeight ? Prisma.sql`AND a.height >= ${validatedMinHeight}` : Prisma.empty}
        ${tagClause}
    `);

    // Tag membership was applied before LIMIT/OFFSET in SQL.
    const filteredResults = results;

    // Get tags for all results
    const resultIds = filteredResults.map((r: any) => r.id);
    const allTags = await prisma!.assetTag.findMany({
      where: { assetId: { in: resultIds } },
      include: { tag: true },
    });

    // Group tags by asset
    const tagsByAsset = allTags.reduce((acc: any, at: any) => {
      if (!acc[at.assetId]) acc[at.assetId] = [];
      acc[at.assetId].push({
        id: at.tag.id,
        name: at.tag.name,
      });
      return acc;
    }, {} as Record<string, Array<{ id: string; name: string }>>);

    // Format results
    const formattedResults = filteredResults.map((result: any) => ({
      id: result.id,
      blobUrl: result.blob_url,
      pathname: result.pathname,
      filename: result.filename,
      mime: result.mime,
      size: result.size,
      width: result.width,
      height: result.height,
      favorite: result.favorite,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      similarity: result.similarity,
      relevance: Math.round(result.similarity * 100),
      tags: tagsByAsset[result.id] || [],
    }));

    const queryTime = Date.now() - startTime;
    const totalCount = exactTotal
      ? Number(exactTotal[0]?.total_count ?? 0)
      : results.length > 0 ? Number(results[0].total_count) : 0;

    // Cache the SQL-computed page envelope, including empty pages, so a hit
    // cannot regress to result-count totals after filtering or OFFSET.
    const paginationHasMore = offset + limit < totalCount;
    const cacheKey = {
      filters,
      limit,
      offset,
      threshold,
      sortBy,
    };
    await cache.setSearchResultPage(
      userId,
      query,
      cacheKey,
      formattedResults,
      totalCount,
      paginationHasMore,
      undefined,
      CLIP_MODEL,
    );

    // Log search
    logSearch(userId, query, formattedResults.length, queryTime).catch(() => {});

    return NextResponse.json({
      results: formattedResults,
      query,
      filters,
      sortBy,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: paginationHasMore,
      },
      processingTime: queryTime,
      embeddingModel: embeddingResult.model,
      searchType: 'semantic',
      cached: false,
    });

  } catch (error) {
    unstable_rethrow(error);

    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // Typed embedding outcomes keep their Retry-After contract below; only
    // genuine enrollment failures take the duck-typed enrollment path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingError)) {
      return enrollmentUnavailableResponse();
    }
    if (isEnrollmentIdentityConflictError(error)) return enrollmentIdentityConflictResponse();
    if (error instanceof EmbeddingConfigurationError) {
      await reportEmbeddingConfigurationErrorOnce(error, 'advanced-search:configuration');
    }
    // Error performing advanced search

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}),
          results: [],
          query: query || '',
          pagination: { total: 0, limit: limit || 30, offset: offset || 0, hasMore: false },
        },
        {
          status: error.statusCode || 500,
          headers: error instanceof EmbeddingConfigurationError
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to perform advanced search',
        results: [],
        query: query || '',
        pagination: { total: 0, limit: limit || 30, offset: offset || 0, hasMore: false },
      },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'search:advanced' });

// Fallback metadata search when embeddings are unavailable
async function performMetadataSearch(
  userId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
  offset: number
) {
  const where: any = {
    ownerUserId: userId,
    deletedAt: null,
    pathname: {
      contains: query,
      mode: 'insensitive',
    },
  };

  if (filters.favorites === true) {
    where.favorite = true;
  }

  const validatedTags = filters.tags?.filter(
    (tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length < 100
  ) || [];
  if (validatedTags.length > 0) {
    // Apply tags in Prisma's WHERE before take/skip so pagination cannot
    // discard untagged rows and return a short or drifting page.
    where.tags = {
      some: {
        tag: {
          ownerUserId: userId,
          name: { in: validatedTags },
        },
      },
    };
  }

  if (filters.mimeTypes && filters.mimeTypes.length > 0) {
    where.mime = { in: filters.mimeTypes };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom && isValidISODate(filters.dateFrom)) {
      where.createdAt.gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo && isValidISODate(filters.dateTo)) {
      where.createdAt.lte = new Date(filters.dateTo);
    }
  }

  if (filters.minWidth) {
    where.width = { gte: filters.minWidth };
  }

  if (filters.minHeight) {
    where.height = { gte: filters.minHeight };
  }

  const assets = await prisma!.asset.findMany({
    where,
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  return assets.map((asset: any) => ({
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
    updatedAt: asset.updatedAt,
    similarity: 0,
    relevance: 0,
    tags: asset.tags.map((at: any) => ({
      id: at.tag.id,
      name: at.tag.name,
    })),
  }));
}

// Helper to validate ISO 8601 date strings
function isValidISODate(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  // Strict ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss(.sss)?(Z|+HH:mm)?
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  if (!isoPattern.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function applyMockFilters(results: any[], filters: SearchFilters, sortBy: string) {
  let filtered = [...results];

  if (filters.favorites === true) {
    filtered = filtered.filter(item => item.favorite);
  }

  if (filters.mimeTypes && filters.mimeTypes.length > 0) {
    filtered = filtered.filter(item => filters.mimeTypes!.includes(item.mime));
  }

  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(item =>
      item.tags?.some((tag: any) => filters.tags!.includes(tag.name))
    );
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    filtered = filtered.filter(item => new Date(item.createdAt) >= from);
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    filtered = filtered.filter(item => new Date(item.createdAt) <= to);
  }

  if (filters.minWidth) {
    filtered = filtered.filter(item => (item.width ?? 0) >= filters.minWidth!);
  }

  if (filters.minHeight) {
    filtered = filtered.filter(item => (item.height ?? 0) >= filters.minHeight!);
  }

  switch (sortBy) {
    case 'date':
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case 'favorite':
      filtered.sort((a, b) => Number(b.favorite) - Number(a.favorite));
      break;
    case 'relevance':
    default:
      filtered.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
      break;
  }

  return filtered;
}
