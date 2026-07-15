import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import {
  DEFAULT_MAX_PILES,
  DEFAULT_MINIMUM_PILE_ASSETS,
  getAutomaticPiles,
  PileEmbeddingUnavailableError,
} from '@/lib/piles/semantic-piles';
import { createErrorResponse } from '@/lib/error-response';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { prisma } from '@/lib/db';
import {
  assertEnrolledUser,
  enrollmentDeniedResponse,
  enrollmentUnavailableResponse,
  isEnrollmentDeniedError,
  isEnrollmentUnavailableError,
} from '@/lib/enrollment/enrollment-policy';
import {
  EmbeddingConfigurationError,
  EmbeddingError,
  embeddingConfigurationHeaders,
  embeddingRetryHeaders,
  reportEmbeddingConfigurationErrorOnce,
} from '@/lib/embedding-errors';

const MIN_LIMIT = 1;
const MAX_LIMIT = 12;
const MIN_ASSETS = 1;
const MAX_MIN_ASSETS = 500;

function parseBoundedInteger(
  value: string | null,
  defaultValue: number,
  min: number,
  max: number
): number | null {
  if (value === null) return defaultValue;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

async function getHandler(req: NextRequest, _context: unknown, { principal }: { principal: { userId: string } }) {
  const requestId = crypto.randomUUID();

  try {
    const { searchParams } = new URL(req.url);
    const maxPiles = parseBoundedInteger(searchParams.get('limit'), DEFAULT_MAX_PILES, MIN_LIMIT, MAX_LIMIT);
    if (maxPiles === null) {
      return NextResponse.json(
        { error: `Invalid limit parameter. Must be integer ${MIN_LIMIT}-${MAX_LIMIT}.` },
        { status: 400 }
      );
    }

    const minimumAssets = parseBoundedInteger(
      searchParams.get('minAssets'),
      DEFAULT_MINIMUM_PILE_ASSETS,
      MIN_ASSETS,
      MAX_MIN_ASSETS
    );
    if (minimumAssets === null) {
      return NextResponse.json(
        { error: `Invalid minAssets parameter. Must be integer ${MIN_ASSETS}-${MAX_MIN_ASSETS}.` },
        { status: 400 }
      );
    }

    await assertEnrolledUser(principal.userId, prisma);

    const result = await getAutomaticPiles({ userId: principal.userId, maxPiles, minimumAssets });
    return NextResponse.json(result);
  } catch (error) {
    unstable_rethrow(error);

    if (isEnrollmentDeniedError(error)) return enrollmentDeniedResponse();
    // Typed embedding outcomes keep their Retry-After contract below; only
    // genuine enrollment failures take the duck-typed enrollment path.
    if (isEnrollmentUnavailableError(error) && !(error instanceof EmbeddingError)) {
      return enrollmentUnavailableResponse();
    }

    if (error instanceof EmbeddingConfigurationError) {
      reportEmbeddingConfigurationErrorOnce(error, 'piles:embedding-configuration');
      return NextResponse.json(
        { error: error.message, reason: error.reason, retryable: false },
        { status: error.statusCode ?? 503, headers: embeddingConfigurationHeaders(error) },
      );
    }

    if (error instanceof PileEmbeddingUnavailableError) {
      return NextResponse.json(
        {
          error: 'Automatic piles are temporarily unavailable: anchor embeddings are not ready.',
          code: error.code,
          reason: error.reason,
          retryAfterSec: error.retryAfterSec,
          retryable: true,
        },
        {
          status: error.statusCode ?? 503,
          headers: embeddingRetryHeaders(error),
        }
      );
    }

    logError('GET /api/piles', error, { requestId });
    return createErrorResponse(
      'Failed to build automatic piles',
      requestId,
      req,
      error instanceof Error ? error.message : undefined
    );
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'piles:list' });
