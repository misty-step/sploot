import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { withAuthenticatedApi, type AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';

async function postHandler(req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    const body = await req.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    if (query.length > 500) {
      return NextResponse.json(
        { error: 'Query text too long (max 500 characters)' },
        { status: 400 }
      );
    }

    const embeddingGate = getRuntimeGate('embeddings');
    if (!embeddingGate.enabled) {
      return runtimeGateResponse(embeddingGate);
    }

    let embeddingService;
    try {
      embeddingService = createEmbeddingService(userId);
    } catch (error) {
      // Failed to initialize embedding service
      return NextResponse.json(
        {
          error: 'Embedding service not configured',
          details: 'Replicate API token not set. Please configure REPLICATE_API_TOKEN in your environment variables.'
        },
        { status: 503 }
      );
    }

    const result = await embeddingService.embedText(query);

    return NextResponse.json({
      success: true,
      embedding: result.embedding,
      model: result.model,
      dimension: result.dimension,
      processingTime: result.processingTime,
    });

  } catch (error) {
    // Error generating text embedding

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate text embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'embeddings:text' });
