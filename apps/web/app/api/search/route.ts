import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch, logSearch } from '@/lib/db';
import { CLIP_MODEL, createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { getAuthWithUser } from '@/lib/auth/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';
import { normalizeCachedGridResults } from '@/lib/asset-grid-dto';
import { mapPublicEmbeddingError } from '@/lib/search/public-search-errors';
import {
  createSplootApiSearchResult,
  parseSplootApiSearchResponse,
  type SplootApiSearchResponse,
} from '@sploot/common';
import type { VectorSearchRow } from '@/lib/db';

const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 100;

function invalidSearchParameter(field: string, expected: string) {
  return NextResponse.json(
    {
      error: `Invalid ${field} parameter`,
      code: 'invalid_search_parameter',
      details: { field, expected },
    },
    { status: 400 },
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlySearchBodyKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => ['query', 'limit', 'threshold', 'shuffleSeed'].includes(key));
}

function publicSearchJson(body: SplootApiSearchResponse): Response {
  const parsed = parseSplootApiSearchResponse(body);
  if (!parsed) throw new Error('Internal public search DTO validation failed');
  return NextResponse.json(parsed);
}

// POST opts into upload-token auth (allowUploadToken: true) so a personal API
// token can drive search — the read half of the token-scoped external
// contract in apps/web/docs/PUBLIC_API.md. See sploot-071.
const postHandler = withAuthenticatedApi(async (req: NextRequest, _context, { principal }) => {
  const startTime = Date.now();
  let query: string = '';
  let limit: number = 30;
  let threshold: number = SEARCH_SIMILARITY_FLOOR;
  let shuffleSeed: number | undefined = undefined;

  try {
    const userId = principal.userId;

    const body: unknown = await req.json();
    if (!isPlainRecord(body) || !hasOnlySearchBodyKeys(body)) {
      return invalidSearchParameter('request body', 'an object with only documented search fields');
    }
    query = body.query as string;
    if (body.limit !== undefined) limit = body.limit as number;
    if (body.threshold !== undefined) threshold = body.threshold as number;
    if (body.shuffleSeed !== undefined) shuffleSeed = body.shuffleSeed as number;

    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < SEARCH_LIMIT_MIN ||
      limit > SEARCH_LIMIT_MAX
    ) {
      return invalidSearchParameter('limit', 'an integer from 1 through 100');
    }
    if (
      typeof threshold !== 'number' ||
      !Number.isFinite(threshold) ||
      threshold < 0 ||
      threshold > 1
    ) {
      return invalidSearchParameter('threshold', 'a finite number from 0 through 1');
    }
    if (shuffleSeed !== undefined &&
        (!Number.isSafeInteger(shuffleSeed) || shuffleSeed < 0 || shuffleSeed > 1_000_000)) {
      return invalidSearchParameter('shuffleSeed', 'an integer from 0 through 1000000');
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    const effectiveLimit = limit;

    if (query.length > 500) {
      return NextResponse.json(
        { error: 'Query text too long (max 500 characters)' },
        { status: 400 }
      );
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Get cache service
    const cache = getCacheService();

    const cachedResults = await cache.getSearchResults(
      userId,
      query,
      { limit: effectiveLimit, threshold, shuffleSeed }
    );

    const normalizedCachedResults = normalizeCachedGridResults(cachedResults);
    if (normalizedCachedResults) {
      const cachedFallbackUsed = normalizedCachedResults.some((result) => Boolean(result.belowThreshold));
      // Cache hit for search
      const responseBody: SplootApiSearchResponse = {
        results: normalizedCachedResults,
        query,
        total: normalizedCachedResults.length,
        limit: effectiveLimit,
        requestedLimit: limit,
        threshold,
        requestedThreshold: threshold,
        thresholdFallback: cachedFallbackUsed,
        processingTime: Date.now() - startTime,
        cached: true,
      };
      return publicSearchJson(responseBody);
    }

    // Cache-first query embedding: the Postgres text-embedding store outlives
    // processes (qa:seed and prior searches populate it), so a hit needs no
    // Replicate service and no generation gate — nothing is being generated.
    let queryEmbedding = await cache.getTextEmbedding(query, CLIP_MODEL);
    let embeddingModel = CLIP_MODEL;

    if (!queryEmbedding) {
      const embeddingGate = getRuntimeGate('embeddings');
      if (!embeddingGate.enabled) {
        return runtimeGateResponse(embeddingGate);
      }

      // Initialize embedding service
      let embeddingService;
      try {
        embeddingService = createEmbeddingService(userId);
      } catch (error) {
        // Failed to initialize embedding service. A degraded backend must not
        // masquerade as an honest empty result set (HTTP 200 + results: []
        // renders as "no matches" in the client).
        return NextResponse.json(
          {
            error: 'Search is temporarily unavailable.',
            code: 'embeddings_disabled',
            retryable: true,
            query,
            processingTime: Date.now() - startTime,
          },
          { status: 503 }
        );
      }

      // Generate text embedding for the query
      const embeddingResult = await embeddingService.embedText(query);
      queryEmbedding = embeddingResult.embedding;
      embeddingModel = embeddingResult.model;
    }

    // Perform vector similarity search. Keep zero-results honest: callers asked
    // for a similarity floor, so do not pad misses with threshold-0 results.
    let searchResults = await vectorSearch(
      userId,
      queryEmbedding,
      { limit: effectiveLimit, threshold, shuffleSeed }
    );

    // Ensure we only return up to the effective limit
    searchResults = searchResults.slice(0, effectiveLimit);

    // Format results with additional metadata
    const formattedResults = searchResults.map((result: VectorSearchRow) => createSplootApiSearchResult({
      id: result.id,
      blobUrl: result.blob_url,
      thumbnailUrl: result.thumbnail_url ?? null,
      similarity: result.distance,
    }));

    const queryTime = Date.now() - startTime;

    // Cache the search results
    if (formattedResults.length > 0) {
      await cache.setSearchResults(
        userId,
        query,
        { limit: effectiveLimit, threshold, shuffleSeed },
        formattedResults
      );
    }

    // Log search for analytics (non-blocking)
    logSearch(userId, query, formattedResults.length, queryTime).catch(error => {
      // Failed to log search
    });

    const responseBody: SplootApiSearchResponse = {
      results: formattedResults,
      query,
      total: formattedResults.length,
      limit: effectiveLimit,
      requestedLimit: limit,
      threshold,
      requestedThreshold: threshold,
      processingTime: queryTime,
      cached: false,
      thresholdFallback: false,
    };
    return publicSearchJson(responseBody);

  } catch (error) {
    unstable_rethrow(error);
    // Error performing search

    if (error instanceof EmbeddingError) {
      const failure = mapPublicEmbeddingError(error);
      return NextResponse.json(
        {
          error: failure.message,
          code: failure.code,
          retryable: failure.retryable,
          results: [],
          query: query || '',
          total: 0,
        },
        { status: failure.status }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to perform search',
        code: 'server_error',
        results: [],
        query: query || '',
        total: 0,
      },
      { status: 500 }
    );
  }
}, { allowUploadToken: true });

export const POST = withObservability(postHandler, { operation: 'search:query' });

// GET endpoint for search suggestions or recent searches
export async function GET(req: NextRequest) {
  try {
    const { userId } = await getAuthWithUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'recent';

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    if (type === 'recent') {
      const recentSearches = await prisma.searchLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        distinct: ['query'],
      });

      return NextResponse.json({
        searches: recentSearches.map((log) => ({
          query: log.query,
          resultCount: log.resultCount,
          timestamp: log.createdAt,
        })),
      });
    }

    if (type === 'popular') {
      const popularSearches = await prisma.searchLog.groupBy({
        by: ['query'],
        _count: {
          query: true,
        },
        orderBy: {
          _count: {
            query: 'desc',
          },
        },
        take: 10,
      });

      return NextResponse.json({
        searches: popularSearches.map((item) => ({
          query: item.query,
          count: item._count.query,
        })),
      });
    }

    return NextResponse.json(
      { error: 'Invalid search type. Use "recent" or "popular".' },
      { status: 400 }
    );

  } catch (error) {
    // Error fetching search suggestions
    return NextResponse.json(
      { error: 'Failed to fetch search suggestions' },
      { status: 500 }
    );
  }
}
