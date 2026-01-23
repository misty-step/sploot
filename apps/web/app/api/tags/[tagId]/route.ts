import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';

/**
 * PATCH /api/tags/[tagId] - Update a tag
 */
async function patchHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params;
    const tagId = params?.tagId;

    if (!tagId) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }
    const userId = await requireUserIdWithSync();
    const { name, color } = await req.json();

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Verify tag ownership
    const existingTag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!existingTag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    // Check if new name conflicts with existing tag
    if (name && name !== existingTag.name) {
      const conflictingTag = await prisma.tag.findFirst({
        where: {
          ownerUserId: userId,
          name: name.trim().toLowerCase(),
          NOT: {
            id: tagId,
          },
        },
      });

      if (conflictingTag) {
        return NextResponse.json(
          { error: 'Tag with this name already exists' },
          { status: 409 }
        );
      }
    }

    const updatedTag = await prisma.tag.update({
      where: {
        id: tagId,
      },
      data: {
        ...(name && { name: name.trim().toLowerCase() }),
        ...(color !== undefined && { color }),
      },
    });

    return NextResponse.json({
      success: true,
      tag: {
        id: updatedTag.id,
        name: updatedTag.name,
        color: updatedTag.color,
        updatedAt: updatedTag.updatedAt,
      },
    });
  } catch (error) {
    logError('tags:update-failed', error, {});
    return NextResponse.json(
      { error: 'Failed to update tag' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tags/[tagId] - Delete a tag
 */
async function deleteHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params;
    const tagId = params?.tagId;

    if (!tagId) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }
    const userId = await requireUserIdWithSync();

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Verify tag ownership
    const existingTag = await prisma.tag.findFirst({
      where: {
        id: tagId,
        ownerUserId: userId,
      },
    });

    if (!existingTag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    // Delete tag (cascade will remove AssetTag associations)
    await prisma.tag.delete({
      where: {
        id: tagId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    logError('tags:delete-failed', error, {});
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}

export const PATCH = withObservability(patchHandler, { operation: 'tags:update' });
export const DELETE = withObservability(deleteHandler, { operation: 'tags:delete' });
