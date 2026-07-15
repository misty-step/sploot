import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import { embeddingRetryHeaders } from '@/lib/embedding-errors';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { resolveEmbeddingMediaSource } from '@/lib/embedding-media';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';

async function postHandler(req: NextRequest, _context: unknown, { principal }: AuthenticatedApiContext) {
  try {
    const userId = principal.userId;

    await assertEnrolledUser(userId, prisma);

    const body = await req.json();
    const { imageUrl, assetId } = body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid imageUrl parameter' },
        { status: 400 }
      );
    }

    let asset: {
      blobUrl: string;
      thumbnailUrl: string | null;
      mime: string;
      checksumSha256: string;
    } | null = null;
    if (assetId) {
      asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          ownerUserId: userId,
          deletedAt: null,
        },
        select: {
          blobUrl: true,
          thumbnailUrl: true,
          mime: true,
          checksumSha256: true,
        },
      });

      if (!asset) {
        return NextResponse.json(
          { error: 'Asset not found or not authorized' },
          { status: 404 }
        );
      }
    }

    const media = asset
      ? resolveEmbeddingMediaSource({
          mime: asset.mime,
          blobUrl: asset.blobUrl,
          thumbnailUrl: asset.thumbnailUrl,
        })
      : { sourceUrl: imageUrl, sourceKind: 'blob' as const };

    if (media.sourceKind === 'unsupported') {
      return NextResponse.json(
        {
          success: false,
          status: 'terminal_skip',
          error: 'Unsupported video without a poster thumbnail',
          reason: media.skipReason,
        },
        { status: 422 },
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
      if (error instanceof EmbeddingError) throw error;
      return NextResponse.json(
        { error: 'Embedding service not configured' },
        { status: 503 }
      );
    }

    const result = await embeddingService.embedImage(
      media.sourceUrl,
      asset?.checksumSha256,
    );

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
    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // EmbeddingAdmissionError(limiter_unavailable) carries the shared
    // enrollment_unavailable code but keeps its typed Retry-After contract
    // below; only genuine enrollment failures take this path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingAdmissionError)) {
      return enrollmentUnavailableResponse();
    }
    // Error generating image embedding

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message, ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}) },
        {
          status: error.statusCode || 500,
          headers: embeddingRetryHeaders(error),
        }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate image embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'embeddings:image' });
