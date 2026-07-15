import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import {
  createVectorSearchContext,
  decodeVectorSearchCursor,
  prisma,
  vectorSearchCursorMatchesContext,
  vectorSearchPage,
  logSearch,
  VECTOR_SEARCH_CURSOR_CONTEXT_ERROR,
  type VectorSearchRow,
} from '@/lib/db';
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
import { SEARCH_MAX_CURSOR_LENGTH, SEARCH_MAX_LIMIT, SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';
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
  let favoriteOnly = false;
  let tagId: string | null = null;
  let offset = 0;
  let cursor: string | undefined;

  try {
    const userId = principal.userId;

    const body = await req.json();
    ({ query, limit = 30, threshold = SEARCH_SIMILARITY_FLOOR, favoriteOnly = false, tagId = null, offset = 0, cursor } = body);

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
      return NextResponse.json({ error: `Invalid search limit; must be between 1 and ${SEARCH_MAX_LIMIT}` }, { status: 400 });
    }

    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 500) {
      return NextResponse.json({ error: 'Invalid search offset; use the response cursor for pages beyond 500 results' }, { status: 400 });
    }

    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      return NextResponse.json({ error: 'Invalid search threshold; must be between 0 and 1' }, { status: 400 });
    }

    if (typeof favoriteOnly !== 'boolean') {
      return NextResponse.json({ error: 'Invalid favoriteOnly filter; must be boolean' }, { status: 400 });
    }

    if (tagId !== null && tagId !== undefined && (typeof tagId !== 'string' || tagId.trim().length === 0)) {
      return NextResponse.json({ error: 'Invalid tagId filter' }, { status: 400 });
    }
    tagId = typeof tagId === 'string' ? tagId.trim() || null : null;

    if (query.length > 500) {
      return NextResponse.json(
        { error: 'Query text too long (max 500 characters)' },
        { status: 400 }
      );
    }

    const searchContext = createVectorSearchContext({ query, threshold, favoriteOnly, tagId, limit });

    const decodedCursor = typeof cursor === 'string' && cursor.length <= SEARCH_MAX_CURSOR_LENGTH
      ? decodeVectorSearchCursor(cursor)
      : null;
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > SEARCH_MAX_CURSOR_LENGTH || !decodedCursor)) {
      return NextResponse.json({ error: 'Invalid search cursor' }, { status: 400 });
    }
    if (cursor && offset > 0) {
      return NextResponse.json({ error: 'Search cursor cannot be combined with offset' }, { status: 400 });
    }
    if (decodedCursor && !vectorSearchCursorMatchesContext(decodedCursor, searchContext)) {
      return NextResponse.json({ error: VECTOR_SEARCH_CURSOR_CONTEXT_ERROR }, { status: 400 });
    }

    const effectiveLimit = limit;

    await assertEnrolledUser(userId, prisma);

    // Get cache service
    const cache = getCacheService();

    const searchFilters = {
      limit: effectiveLimit,
      threshold,
      sort: 'relevance' as const,
      direction: 'desc' as const,
      favoriteOnly,
      tagId,
      ...(offset > 0 && { offset }),
      ...(cursor && { cursor }),
    };

    const cachedPage = await cache.getSearchResultPage(
      userId,
      query,
      searchFilters
    );

    if (cachedPage) {
      const cachedResults = cachedPage.results;
      const cachedFallbackUsed = cachedResults.some((result: any) => Boolean(result?.belowThreshold));
      // Cache hit for search
      return NextResponse.json({
        results: cachedResults,
        query,
        total: cachedPage.total,
        ...(cachedPage.nextCursor ? { nextCursor: cachedPage.nextCursor } : {}),
        limit: effectiveLimit,
        requestedLimit: limit,
        threshold,
        requestedThreshold: threshold,
        thresholdFallback: cachedFallbackUsed,
        hasMore: cachedPage.hasMore ?? offset + cachedResults.length < cachedPage.total,
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
    const searchPage = await vectorSearchPage(
      userId,
      queryEmbedding,
      {
        limit: effectiveLimit,
        threshold,
        favoriteOnly,
        tagId,
        cursorContext: searchContext,
        ...(offset > 0 && { offset }),
        ...(cursor && { cursor }),
      }
    );
    const searchResults = searchPage.results;

    // Format results with additional metadata
    const formattedResults = await Promise.all(
      searchResults.map(async (result: VectorSearchRow) => {
        // Get tags for each asset
        const assetTags = await prisma!.assetTag.findMany({
          where: { assetId: result.id },
          include: { tag: true },
        });

        return {
          id: result.id,
          blobUrl: result.blob_url,
          thumbnailUrl: result.thumbnail_url ?? null,
          pathname: result.pathname,
          filename: result.pathname.split('/').pop() || result.pathname,
          mime: result.mime,
          width: result.width,
          height: result.height,
          favorite: result.favorite,
          size: result.size,
          createdAt: result.created_at,
          // Indicate embeddings exist (search results always have embeddings)
          embedding: { assetId: result.id },
          embeddingStatus: 'ready' as const,
          similarity: result.distance, // 0-1 score, higher is better
          relevance: Math.round(result.distance * 100), // Percentage for UI
          belowThreshold: false,
          tags: assetTags.map((at: any) => ({
            id: at.tag.id,
            name: at.tag.name,
          })),
        };
      })
    );

    const queryTime = Date.now() - startTime;

    // Cache the search results
    if (formattedResults.length > 0) {
      await cache.setSearchResultPage(
        userId,
        query,
        {
          limit: effectiveLimit,
          threshold,
          sort: 'relevance' as const,
          direction: 'desc' as const,
          favoriteOnly,
          tagId,
          ...(offset > 0 && { offset }),
          ...(cursor && { cursor }),
        },
        formattedResults,
        searchPage.total,
        searchPage.hasMore,
        searchPage.nextCursor,
      );
    }

    // Log search for analytics (non-blocking)
    logSearch(userId, query, formattedResults.length, queryTime).catch(error => {
      // Failed to log search
    });

    return NextResponse.json({
      results: formattedResults,
      query,
      total: searchPage.total,
      ...(searchPage.nextCursor ? { nextCursor: searchPage.nextCursor } : {}),
      limit: effectiveLimit,
      requestedLimit: limit,
      threshold,
      requestedThreshold: threshold,
      processingTime: queryTime,
      embeddingModel,
      cached: false,
      thresholdFallback: false,
      hasMore: searchPage.hasMore ?? offset + formattedResults.length < searchPage.total,
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
    if (error instanceof Error && error.message === VECTOR_SEARCH_CURSOR_CONTEXT_ERROR) {
      return NextResponse.json({ error: VECTOR_SEARCH_CURSOR_CONTEXT_ERROR }, { status: 400 });
    }

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
