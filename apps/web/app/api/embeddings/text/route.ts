import { NextRequest, NextResponse } from 'next/server';
import { createEmbeddingService, EmbeddingAdmissionError, EmbeddingError } from '@/lib/embeddings';
import { CostAdmissionError, costAdmissionErrorResponse } from '@/lib/cost';
import {
  EmbeddingConfigurationError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';
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
      if (error instanceof EmbeddingError) throw error;
      return NextResponse.json(
        { error: 'Embedding service not configured' },
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
    // EmbeddingAdmissionError(limiter_unavailable) carries the shared
    // enrollment_unavailable code but keeps its typed Retry-After contract
    // below; only genuine enrollment failures take this path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingAdmissionError)) {
      return enrollmentUnavailableResponse();
    }
    if (error instanceof EmbeddingConfigurationError) {
      await reportEmbeddingConfigurationErrorOnce(error, 'embeddings:text:configuration');
    }

    if (error instanceof CostAdmissionError) {
      return costAdmissionErrorResponse(error);
    }
    // Error generating text embedding

    if (error instanceof EmbeddingError) {
      return NextResponse.json(
        { error: error.message, ...(error instanceof EmbeddingAdmissionError && error.code ? { code: error.code } : {}) },
        {
          status: error.statusCode || 500,
          headers: error instanceof EmbeddingConfigurationError
            ? embeddingConfigurationHeaders(error)
            : embeddingRetryHeaders(error),
        }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate text embedding' },
      { status: 500 }
    );
  }
}

export const POST = withObservability(withAuthenticatedApi(postHandler), { operation: 'embeddings:text' });
