import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import { getRuntimeGate, runtimeGateResponse } from '@/lib/runtime-gates';
import { prisma } from '@/lib/db';
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

    await assertEnrolledUser(userId, prisma);

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
    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    if (isEnrollmentUnavailableError(error)) return enrollmentUnavailableResponse();
    // Error generating text embedding

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message, ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}) },
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
