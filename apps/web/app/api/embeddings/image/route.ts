import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingError } from '@/lib/embeddings';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { withAuthenticatedApi, type AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';

async function postHandler(req: NextRequest, _context: RouteContext, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    const body = await req.json();
    const { imageUrl, assetId } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid imageUrl parameter' },
        { status: 400 }
      );
    }

    if (assetId) {
      if (!prisma) {
        return NextResponse.json(
          { error: 'Database not configured' },
          { status: 500 }
        );
      }

      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          ownerUserId: userId,
          deletedAt: null,
        },
      });

      if (!asset) {
        return NextResponse.json(
          { error: 'Asset not found or not authorized' },
          { status: 404 }
        );
      }
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

    const result = await embeddingService.embedImage(imageUrl);

    if (assetId && prisma) {
      await upsertAssetEmbedding({
        assetId,
        modelName: result.model,
        modelVersion: result.model,
        dim: result.dimension,
        embedding: result.embedding,
      });
    }

    return NextResponse.json({
      success: true,
      embedding: result.embedding,
      model: result.model,
      dimension: result.dimension,
      processingTime: result.processingTime,
      assetId: assetId || null,
    });

  } catch (error) {
    // Error generating image embedding

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate image embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'embeddings:image' });
