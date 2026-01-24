import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

/**
 * GET /api/tags - Get all tags for the current user
 */
async function getHandler(req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    const tags = await prisma.tag.findMany({
      where: {
        ownerUserId: userId,
      },
      include: {
        _count: {
          select: {
            assets: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      tags: tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        assetCount: tag._count.assets,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      })),
    });
  } catch (error) {
    logError('tags:list-failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tags - Create a new tag
 */
async function postHandler(req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();
    const { name, color } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Check if tag already exists
    const existingTag = await prisma.tag.findFirst({
      where: {
        ownerUserId: userId,
        name: name.trim().toLowerCase(),
      },
    });

    if (existingTag) {
      return NextResponse.json(
        { error: 'Tag already exists' },
        { status: 409 }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        ownerUserId: userId,
        name: name.trim().toLowerCase(),
        color: color || null,
      },
    });

    return NextResponse.json({
      success: true,
      tag: {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      },
    });
  } catch (error) {
    logError('tags:create-failed', error);
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'tags:list' });
export const POST = withObservability(postHandler, { operation: 'tags:create' });
