import { NextRequest, NextResponse } from 'next/server';
import { isValidTagColor, isValidTagName } from '@sploot/common';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { enrollmentResponseForError, withEnrollmentIdentityWriter } from '@/lib/enrollment/enrollment-policy';

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

    if (name !== undefined && !isValidTagName(name)) {
      return NextResponse.json({ error: 'Tag name is invalid or too long' }, { status: 400 });
    }
    if (color !== undefined && !isValidTagColor(color)) {
      return NextResponse.json({ error: 'Tag color is too long' }, { status: 400 });
    }

    if ( !prisma) {
      return enrollmentUnavailableResponse();
    }

    const result = await withEnrollmentIdentityWriter(prisma, userId, async (tx) => {
      const existingTag = await tx.tag.findFirst({ where: { id: tagId, ownerUserId: userId } });
      if (!existingTag) return { kind: 'missing' as const };
      if (name && name !== existingTag.name) {
        const conflictingTag = await tx.tag.findFirst({
          where: { ownerUserId: userId, name: name.trim().toLowerCase(), NOT: { id: tagId } },
        });
        if (conflictingTag) return { kind: 'conflict' as const };
      }
      const updatedTag = await tx.tag.update({
        where: { id: tagId },
        data: { ...(name && { name: name.trim().toLowerCase() }), ...(color !== undefined && { color }) },
      });
      return { kind: 'updated' as const, updatedTag };
    });

    if (result.kind === 'missing') return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    if (result.kind === 'conflict') return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 });
    const updatedTag = result.updatedTag;

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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    logError('tags:update-failed', error);
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
      return enrollmentUnavailableResponse();
    }

    const deleted = await withEnrollmentIdentityWriter(prisma, userId, async (tx) => {
      const existingTag = await tx.tag.findFirst({ where: { id: tagId, ownerUserId: userId } });
      if (!existingTag) return false;
      await tx.tag.delete({ where: { id: tagId } });
      return true;
    });
    if (!deleted) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    logError('tags:delete-failed', error);
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}

export const PATCH = withObservability(patchHandler, { operation: 'tags:update' });
export const DELETE = withObservability(deleteHandler, { operation: 'tags:delete' });
