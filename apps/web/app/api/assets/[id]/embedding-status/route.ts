import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';

/**
 * GET /api/assets/[id]/embedding-status
 * Check if an asset has embeddings generated
 */
async function getHandler(
  request: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext
) {
  try {
    const userId = principal.userId;
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!prisma) return enrollmentUnavailableResponse();

    // Get the asset and check if it has embeddings
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      include: {
        embedding: {
          select: {
            assetId: true,
            modelName: true,
            createdAt: true,
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      assetId: asset.id,
      hasEmbedding: !!asset.embedding,
      status: asset.embedding ? 'ready' : 'pending',
    });
  } catch (error) {
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    logError('assets:embedding-status-failed', error);
    return NextResponse.json(
      { error: 'Failed to check embedding status' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'assets:embedding-status' });
