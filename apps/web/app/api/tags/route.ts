import { NextRequest, NextResponse } from 'next/server';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import { enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { logError } from '@/lib/observability-logger';
import { enrollmentResponseForError, withEnrollmentIdentityWriter } from '@/lib/enrollment/enrollment-policy';

/**
 * GET /api/tags - Get all tags for the current user
 */
async function getHandler(req: NextRequest) {
  try {
    const userId = await requireUserIdWithSync();

    if ( !prisma) {
      return enrollmentUnavailableResponse();
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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

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
      return enrollmentUnavailableResponse();
    }

    const tag = await withEnrollmentIdentityWriter(prisma, userId, async (tx) => {
      const existingTag = await tx.tag.findFirst({
        where: { ownerUserId: userId, name: name.trim().toLowerCase() },
      });
      if (existingTag) return null;
      return tx.tag.create({
        data: { ownerUserId: userId, name: name.trim().toLowerCase(), color: color || null },
      });
    });

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag already exists' },
        { status: 409 }
      );
    }

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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    logError('tags:create-failed', error);
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'tags:list' });
export const POST = withObservability(postHandler, { operation: 'tags:create' });
