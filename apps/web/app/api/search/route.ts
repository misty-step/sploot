import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch, logSearch, type VectorSearchRow } from '@/lib/db';
import { CLIP_MODEL, createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { getAuthWithUser } from '@/lib/auth/server';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { SEARCH_SIMILARITY_FLOOR } from '@/lib/search-config';

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

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        {
          error: error.message,
          results: [],
          query: query || '',
          total: 0,
        },
        { status: error.statusCode || 500 }
      );
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
    // Error fetching search suggestions
    return NextResponse.json(
      { error: 'Failed to fetch search suggestions' },
      { status: 500 }
    );
  }
}
