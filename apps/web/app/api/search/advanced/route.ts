import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';
import { unstable_rethrow } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { getAuth } from '@/lib/auth/server';
import { withObservability } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { logError } from '@/lib/observability-logger';
import { EmbeddingVectorValidationError } from '@/lib/embedding-vector-sql';
import {
  executeAdvancedSearchQuery,
  type AdvancedSearchSortBy,
} from '@/lib/search/advanced-search-query';
import { normalizeCachedSearchPage } from '@/lib/asset-grid-dto';
import { mapPublicEmbeddingError } from '@/lib/search/public-search-errors';
import type {
  AdvancedSearchErrorResponse,
  AdvancedSearchFilters,
  AdvancedSearchResponse,
} from '@/lib/types';
import type { SplootApiSearchResultDto } from '@sploot/common';
import { createSplootApiSearchResult } from '@sploot/common';

const ADVANCED_BODY_KEYS = ['query', 'filters', 'limit', 'offset', 'threshold', 'sortBy', 'seed'] as const;
const ADVANCED_FILTER_KEYS = ['favorites', 'mimeTypes', 'tags', 'dateFrom', 'dateTo', 'minWidth', 'minHeight'] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseAdvancedFilters(value: unknown): AdvancedSearchFilters | null {
  if (value === undefined) return {};
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ADVANCED_FILTER_KEYS)) return null;
  const filters: AdvancedSearchFilters = {};
  if (value.favorites !== undefined) {
    if (typeof value.favorites !== 'boolean') return null;
    filters.favorites = value.favorites;
  }
  for (const key of ['mimeTypes', 'tags'] as const) {
    if (value[key] !== undefined) {
      if (!Array.isArray(value[key]) || value[key].length > 50 ||
          !value[key].every((item): item is string => typeof item === 'string' && item.length > 0 && item.length < 100)) return null;
      filters[key] = [...value[key]];
    }
  }
  for (const key of ['dateFrom', 'dateTo'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !isValidISODate(value[key])) return null;
      filters[key] = value[key];
    }
  }
  for (const key of ['minWidth', 'minHeight'] as const) {
    if (value[key] !== undefined) {
      if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) return null;
      filters[key] = value[key] as number;
    }
  }
  return filters;
}

function invalidAdvancedParameter(field: string) {
  return NextResponse.json(
    { error: `Invalid ${field} parameter`, code: 'invalid_search_parameter' },
    { status: 400 },
  );
}

async function postHandler(req: NextRequest) {
  const startTime = Date.now();
  let query: string = '';
  let filters: AdvancedSearchFilters = {};
  let limit: number = 30;
  let offset: number = 0;
  let threshold: number = SEARCH_SIMILARITY_FLOOR;
  let sortBy: string = 'relevance';
  let seed: number | null = null;

  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body: unknown = await req.json();
    if (!isPlainRecord(body) || !hasOnlyKeys(body, ADVANCED_BODY_KEYS)) {
      return invalidAdvancedParameter('request body');
    }
    if (typeof body.query !== 'string' || body.query.length === 0 || body.query.length > 500) {
      return invalidAdvancedParameter('query');
    }
    query = body.query;
    const parsedFilters = parseAdvancedFilters(body.filters);
    if (parsedFilters === null) return invalidAdvancedParameter('filters');
    filters = parsedFilters;
    if (body.limit !== undefined) limit = body.limit as number;
    if (body.offset !== undefined) offset = body.offset as number;
    if (body.threshold !== undefined) threshold = body.threshold as number;
    if (body.sortBy !== undefined) sortBy = body.sortBy as string;
    if (body.seed !== undefined) seed = body.seed as number | null;

    // Validate pagination bounds to prevent DoS
    const MAX_LIMIT = 100;
    const MAX_OFFSET = 10000;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return invalidAdvancedParameter('limit');
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
      return invalidAdvancedParameter('offset');
    }
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return invalidAdvancedParameter('threshold');
    }
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 1000000)) {
      return invalidAdvancedParameter('seed');
    }

    if (typeof sortBy !== 'string' || !['relevance', 'date', 'favorite'].includes(sortBy)) {
      return invalidAdvancedParameter('sortBy');
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get cache service
    const cache = getCacheService();

    const validSortOptions = ['relevance', 'date', 'favorite'] as const;
    const validatedSortBy: AdvancedSearchSortBy = validSortOptions.find((option) => option === sortBy)!;

    // Check cache for advanced search results. The cache stores the authoritative
    // total and seed alongside the exact public result DTOs.
    const cacheKey = {
      filters,
      limit,
      offset,
      threshold,
      sortBy: validatedSortBy,
      seed,
    };
    const cachedPage = typeof cache.getSearchResultsPage === 'function'
      ? await cache.getSearchResultsPage(userId, query, cacheKey)
      : null;

    const normalizedCachedPage = cachedPage ? normalizeCachedSearchPage(cachedPage) : null;
    if (normalizedCachedPage) {
      const responseBody: AdvancedSearchResponse = {
        results: normalizedCachedPage.results,
        query,
        filters,
        sortBy: validatedSortBy,
        pagination: { total: normalizedCachedPage.total, page: Math.floor(offset / limit) + 1, limit, offset, hasMore: offset + limit < normalizedCachedPage.total },
        seed: normalizedCachedPage.seed,
        processingTime: Date.now() - startTime,
        searchType: 'semantic',
        cached: true,
        error: null,
      };
      return NextResponse.json(responseBody);
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
    }

    // Initialize embedding service
    let embeddingService;
    try {
      embeddingService = createEmbeddingService(userId);
    } catch (error) {
      // Failed to initialize embedding service

      // Fallback to metadata-only search when embeddings unavailable
      const assets = await performMetadataSearch(userId, query, filters, limit, offset, validatedSortBy, seed);

      const responseBody: AdvancedSearchResponse = {
        results: assets.results,
        query,
        filters,
        sortBy: validatedSortBy,
        pagination: { total: assets.total, page: Math.floor(offset / limit) + 1, limit, offset, hasMore: offset + limit < assets.total },
        seed,
        processingTime: Date.now() - startTime,
        searchType: 'metadata',
        cached: false,
        error: 'Semantic search unavailable. Showing filename matches.',
      };
      return NextResponse.json(responseBody);
    }

    // Generate text embedding
    const embeddingResult = await embeddingService.embedText(query);

    let queryResult: Awaited<ReturnType<typeof executeAdvancedSearchQuery>>;
    try {
      queryResult = await executeAdvancedSearchQuery(prisma, {
        userId,
        embedding: embeddingResult.embedding,
        filters,
        threshold,
        limit,
        offset,
        sortBy: validatedSortBy,
        seed,
      });
    } catch (error) {
      logError('advanced-search:query-failed', error, {
        embeddingLength: Array.isArray(embeddingResult.embedding)
          ? embeddingResult.embedding.length
          : 'invalid',
      });
      const responseBody: AdvancedSearchErrorResponse = {
        error: error instanceof EmbeddingVectorValidationError
          ? 'Invalid embedding format from service'
          : 'Failed to perform advanced search',
        code: error instanceof EmbeddingVectorValidationError ? 'invalid_embedding' : 'server_error',
        results: [],
        query,
        pagination: { total: 0, page: Math.floor(offset / limit) + 1, limit, offset, hasMore: false },
      };
      return NextResponse.json(responseBody, { status: 500 });
    }

    const { rows: results, totalCount } = queryResult;

    // Format results
    const formattedResults = results.map((result) => createSplootApiSearchResult({
      id: result.id,
      blobUrl: result.blob_url,
      thumbnailUrl: result.thumbnail_url ?? null,
      similarity: result.similarity,
    }));

    const queryTime = Date.now() - startTime;
    // Cache the search results
    if (formattedResults.length > 0) {
      const cacheKey = {
        filters,
        limit,
        offset,
        threshold,
        sortBy: validatedSortBy,
        seed,
      };
      await cache.setSearchResults(userId, query, cacheKey, formattedResults, { total: totalCount, seed });
    }

    // Log search
    prisma!.searchLog.create({
      data: {
        userId,
        query,
        resultCount: formattedResults.length,
        queryTime,
      },
    }).catch(() => {});

    const responseBody: AdvancedSearchResponse = {
      results: formattedResults,
      query,
      filters,
      sortBy: validatedSortBy,
      pagination: { total: totalCount, page: Math.floor(offset / limit) + 1, limit, offset, hasMore: offset + limit < totalCount },
      seed,
      processingTime: queryTime,
      searchType: 'semantic',
      cached: false,
      error: null,
    };
    return NextResponse.json(responseBody);

  } catch (error) {
    unstable_rethrow(error);
    // Error performing advanced search

    if (error instanceof EmbeddingError) {
      const failure = mapPublicEmbeddingError(error);
      const responseBody: AdvancedSearchErrorResponse = {
        error: failure.message,
        code: failure.code,
        retryable: failure.retryable,
        results: [],
        query: query || '',
        pagination: { total: 0, page: Math.floor((offset || 0) / (limit || 30)) + 1, limit: limit || 30, offset: offset || 0, hasMore: false },
      };
      return NextResponse.json(responseBody, { status: failure.status });
    }

    const responseBody: AdvancedSearchErrorResponse = {
      error: 'Failed to perform advanced search',
      code: 'server_error',
      results: [],
      query: query || '',
      pagination: { total: 0, page: Math.floor((offset || 0) / (limit || 30)) + 1, limit: limit || 30, offset: offset || 0, hasMore: false },
    };
    return NextResponse.json(responseBody, { status: 500 });
  }
}

export const POST = withObservability(postHandler, { operation: 'search:advanced' });

// Fallback metadata search when embeddings are unavailable
async function performMetadataSearch(
  userId: string,
  query: string,
  filters: AdvancedSearchFilters,
  limit: number,
  offset: number,
  sortBy: AdvancedSearchSortBy,
  seed: number | null,
): Promise<{ results: SplootApiSearchResultDto[]; total: number }> {
  const where: Prisma.AssetWhereInput = {
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

  const tagFilters = (filters.tags ?? []).filter(
    (tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length < 100,
  );
  if (tagFilters.length > 0) {
    where.tags = {
      some: {
        tag: { ownerUserId: userId, name: { in: tagFilters } },
      },
    };
  }

  const orderBy = sortBy === 'favorite'
    ? [{ favorite: 'desc' as const }, { createdAt: 'desc' as const }]
    : [{ createdAt: 'desc' as const }];

  const [assets, total] = await Promise.all([
    prisma!.asset.findMany({
    where,
    ...(seed === null ? { take: limit, skip: offset } : {}),
    orderBy,
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    }),
    prisma!.asset.count({ where }),
  ]);

  const orderedAssets = seed === null ? assets : [...assets].sort((a, b) => {
    if (sortBy === 'favorite' && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (sortBy === 'date') {
      const dateOrder = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateOrder !== 0) return dateOrder;
    }
    const hash = (id: string) => {
      let value = 2166136261 ^ seed;
      for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
      return value >>> 0;
    };
    return hash(a.id) - hash(b.id) || a.id.localeCompare(b.id);
  }).slice(offset, offset + limit);

  return {
    results: orderedAssets.map((asset) => createSplootApiSearchResult({
      id: asset.id,
      blobUrl: asset.blobUrl,
      thumbnailUrl: asset.thumbnailUrl ?? null,
      similarity: 0,
    })),
    total,
  };
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
