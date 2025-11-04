import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';

/**
 * GET /api/assets/[id]/embedding-status
 * Check if an asset has embeddings generated
 */
async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    const { id } = await params;

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
    console.error('Error checking embedding status:', error);
    return NextResponse.json(
      { error: 'Failed to check embedding status' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:embedding-status' });
