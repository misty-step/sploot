import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch, logSearch, type VectorSearchRow } from '@/lib/db';
import { toGridAsset, mapAssetTags } from '@/lib/asset-dto';
import { CLIP_MODEL, createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import {
  EmbeddingConfigurationError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
import { getCacheService } from '@/lib/cache';
import { getAuthWithUser } from '@/lib/auth/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentIdentityConflictResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';

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

    const body = await req.json();
    ({ query, limit = 30, threshold = SEARCH_SIMILARITY_FLOOR, shuffleSeed } = body);

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

    await assertEnrolledUser(userId, prisma);

    // Get cache service
    const cache = getCacheService();

    const cachedResults = await cache.getSearchResults(
      userId,
      query,
      { limit: effectiveLimit, threshold, shuffleSeed }
    );

    if (cachedResults) {
      const cachedFallbackUsed = cachedResults.some((result: any) => Boolean(result?.belowThreshold));
      // Cache hit for search
      return NextResponse.json({
        results: cachedResults,
        query,
        total: cachedResults.length,
        limit: effectiveLimit,
        requestedLimit: limit,
        threshold,
        requestedThreshold: threshold,
        thresholdFallback: cachedFallbackUsed,
        processingTime: Date.now() - startTime,
        cached: true,
      });
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

      // Initialize embedding service. Typed provider configuration failures
      // flow to the shared EmbeddingError HTTP mapping below.
      let embeddingService;
      try {
        embeddingService = createEmbeddingService(userId);
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;
        return NextResponse.json(
          {
            error: 'Search is temporarily unavailable: embedding service is not configured.',
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
    const formattedResults = await Promise.all(
      searchResults.map(async (result: VectorSearchRow) => {
        // Get tags for each asset
        const assetTags = await prisma!.assetTag.findMany({
          where: { assetId: result.id },
          include: { tag: true },
        });

        return toGridAsset(result, {
          tags: mapAssetTags(assetTags),
          belowThreshold: false,
        });
      })
    );

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

    return NextResponse.json({
      results: formattedResults,
      query,
      total: formattedResults.length,
      limit: effectiveLimit,
      requestedLimit: limit,
      threshold,
      requestedThreshold: threshold,
      processingTime: queryTime,
      embeddingModel,
      cached: false,
      thresholdFallback: false,
    });

  } catch (error) {
    unstable_rethrow(error);
    // Error performing search

    if (error instanceof EmbeddingConfigurationError) {
      await reportEmbeddingConfigurationErrorOnce(error, 'search:configuration');
    }

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}),
          results: [],
          query: query || '',
          total: 0,
        },
        {
          status: error.statusCode || 500,
          headers: error instanceof EmbeddingConfigurationError
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    if (isEnrollmentUnavailableError(error)) return enrollmentUnavailableResponse();

    return NextResponse.json(
      {
        error: 'Failed to perform search',
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
async function getHandler(req: NextRequest) {
  try {
    const { userId, syncStatus } = await getAuthWithUser();
    if (syncStatus === 'denied') return enrollmentDeniedResponse();
    if (syncStatus === 'conflict') return enrollmentIdentityConflictResponse();
    if (syncStatus === 'unavailable' || syncStatus === 'failed') return enrollmentUnavailableResponse();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'recent';

    await assertEnrolledUser(userId, prisma);

    if (type === 'recent') {
      const recentSearches = await prisma.searchLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        distinct: ['query'],
      });

      return NextResponse.json({
        searches: recentSearches.map((log: any) => ({
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
        searches: popularSearches.map((item: any) => ({
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
    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    if (isEnrollmentUnavailableError(error)) return enrollmentUnavailableResponse();
    // Error fetching search suggestions
    return NextResponse.json(
      { error: 'Failed to fetch search suggestions' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'search:suggestions' });
