import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

/**
 * GET /api/assets/[id]/embedding-status
 * Check if an asset has embeddings generated
 */
async function getHandler(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await auth();
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

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

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
    logError('assets:embedding-status-failed', error);
    return NextResponse.json(
      { error: 'Failed to check embedding status' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:embedding-status' });
