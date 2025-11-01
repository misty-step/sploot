import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { prisma, vectorSearch, logSearch } from '@/lib/db';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { getCacheService } from '@/lib/cache';
import { getAuthWithUser } from '@/lib/auth/server';

const MIN_SIMILAR_RESULTS = 10;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let query: string = '';
  let limit: number = 30;
  let threshold: number = 0.2;
  let shuffleSeed: number | undefined = undefined;

  try {
    const { userId } = await getAuthWithUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    ({ query, limit = 30, threshold = 0.2, shuffleSeed } = body);

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    const effectiveLimit = Math.max(limit, MIN_SIMILAR_RESULTS);

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

    // Initialize embedding service
    let embeddingService;
    try {
      embeddingService = createEmbeddingService();
    } catch (error) {
      // Failed to initialize embedding service

      // Return empty results when embedding service is unavailable
      return NextResponse.json({
        results: [],
        query,
        total: 0,
        limit: effectiveLimit,
        requestedLimit: limit,
        processingTime: Date.now() - startTime,
        requestedThreshold: threshold,
        threshold,
        thresholdFallback: false,
        error: 'Search is currently unavailable. Please configure Replicate API token.',
      });
    }

    // Generate text embedding for the query
    const embeddingResult = await embeddingService.embedText(query);

    // Perform vector similarity search
    let appliedThreshold = threshold;
    let usedFallbackThreshold = false;

    let searchResults = await vectorSearch(
      userId,
      embeddingResult.embedding,
      { limit: effectiveLimit, threshold: appliedThreshold, shuffleSeed }
    );

    if ((searchResults.length === 0 || searchResults.length < MIN_SIMILAR_RESULTS) && appliedThreshold > 0) {
      const fallbackLimit = Math.max(effectiveLimit, MIN_SIMILAR_RESULTS);
      const fallbackResults = await vectorSearch(
        userId,
        embeddingResult.embedding,
        { limit: fallbackLimit, threshold: 0, shuffleSeed }
      );

      const mergedResults: typeof searchResults = [];
      const seen = new Set<string>();

      for (const result of searchResults) {
        mergedResults.push(result);
        seen.add(result.id);
      }

      for (const result of fallbackResults) {
        if (seen.has(result.id)) {
          continue;
        }
        mergedResults.push(result);
        seen.add(result.id);
      }

      if (mergedResults.length > searchResults.length) {
        usedFallbackThreshold = true;
      }

      searchResults = mergedResults.slice(0, fallbackLimit);
    }

    // Ensure we only return up to the effective limit
    searchResults = searchResults.slice(0, effectiveLimit);

    // Format results with additional metadata
    const formattedResults = await Promise.all(
      searchResults.map(async (result: any) => {
        // Get tags for each asset
        const assetTags = await prisma!.assetTag.findMany({
          where: { assetId: result.id },
          include: { tag: true },
        });

        return {
          id: result.id,
          blobUrl: result.blob_url,
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
          belowThreshold: appliedThreshold > 0 && result.distance < appliedThreshold,
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
      threshold: appliedThreshold,
      requestedThreshold: threshold,
      processingTime: queryTime,
      embeddingModel: embeddingResult.model,
      cached: false,
      thresholdFallback: usedFallbackThreshold,
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
}

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
