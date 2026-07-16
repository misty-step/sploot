import { NextRequest, NextResponse } from 'next/server';
import { TAG, isValidAssetId, isValidTagName } from '@sploot/common';
import { unstable_rethrow } from 'next/navigation';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { isUnauthorizedAuthError, unauthorizedResponse } from '@/lib/auth/api';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { logError } from '@/lib/observability-logger';
import { enrollmentResponseForError, enrollmentUnavailableResponse, withEnrollmentIdentityWriter } from '@/lib/enrollment/enrollment-policy';

class TagLimitError extends Error {}


/**
 * GET /api/assets/[id]/tags - Get tags for a specific asset
 */
async function getHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const userId = await requireUserIdWithSync();
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }

    if (!prisma) return enrollmentUnavailableResponse();

    // Verify asset ownership
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      include: {
        tags: {
          include: {
            tag: true,
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
      success: true,
      tags: asset.tags.map(at => ({
        id: at.tag.id,
        name: at.tag.name,
        color: at.tag.color,
      })),
    });
  } catch (error) {
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    unstable_rethrow(error);
    logError('assets:tags-list-failed', error);
    return NextResponse.json(
      { error: 'Failed to fetch asset tags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/assets/[id]/tags - Add tags to an asset
 */
async function postHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const userId = await requireUserIdWithSync();
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }
    const { tagIds, tagNames } = await req.json();
    if (tagIds !== undefined && (!Array.isArray(tagIds) || tagIds.length > TAG.maxRequestItems || tagIds.some((value) => !isValidAssetId(value)))) {
      return NextResponse.json({ error: 'Tag IDs are invalid or too many' }, { status: 400 });
    }
    if (tagNames !== undefined && (!Array.isArray(tagNames) || tagNames.length > TAG.maxRequestItems || tagNames.some((value) => !isValidTagName(value)))) {
      return NextResponse.json({ error: 'Tag names are invalid or too many' }, { status: 400 });
    }

    if (!prisma) return enrollmentUnavailableResponse();

    const addedTags = await withEnrollmentIdentityWriter(prisma, userId, async (tx) => {
      const ownedAsset = await tx.asset.findFirst({
        where: { id, ownerUserId: userId, deletedAt: null },
      });
      if (!ownedAsset) return null;
      const added = [];
      let associationCount = await tx.assetTag.count({ where: { assetId: id } });
      let userTagCount = await tx.tag.count({ where: { ownerUserId: userId } });

    // Handle tag IDs
    if (tagIds && Array.isArray(tagIds)) {
      for (const tagId of tagIds) {
        // Verify tag ownership
        const tag = await tx.tag.findFirst({
          where: {
            id: tagId,
            ownerUserId: userId,
          },
        });

        if (tag) {
          // Check if association already exists
          const existingAssociation = await tx.assetTag.findUnique({
            where: {
              assetId_tagId: {
                assetId: id,
                tagId: tagId,
              },
            },
          });

          if (!existingAssociation) {
            if (associationCount >= TAG.maxPerAsset) throw new TagLimitError('tag limit reached');
            await tx.assetTag.create({
              data: {
                assetId: id,
                tagId: tagId,
              },
            });
            added.push(tag);
            associationCount += 1;
          }
        }
      }
    }

    // Handle tag names (create tags if they don't exist)
    if (tagNames && Array.isArray(tagNames)) {
      for (const tagName of tagNames) {
        const normalizedName = tagName.trim().toLowerCase();

        // Find or create tag
        let tag = await tx.tag.findFirst({
          where: {
            ownerUserId: userId,
            name: normalizedName,
          },
        });

        if (!tag) {
          if (userTagCount >= TAG.maxPerUser) throw new TagLimitError('tag limit reached');
          tag = await tx.tag.create({
            data: {
              ownerUserId: userId,
              name: normalizedName,
            },
          });
          userTagCount += 1;
        }

        // Check if association already exists
        const existingAssociation = await tx.assetTag.findUnique({
          where: {
            assetId_tagId: {
              assetId: id,
              tagId: tag.id,
            },
          },
        });

        if (!existingAssociation) {
          if (associationCount >= TAG.maxPerAsset) throw new TagLimitError('tag limit reached');
          await tx.assetTag.create({
            data: {
              assetId: id,
              tagId: tag.id,
            },
          });
          added.push(tag);
          associationCount += 1;
        }
      }
    }

      return { kind: 'ok' as const, added };
    });

    if (!addedTags) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    if (addedTags.kind !== 'ok') return NextResponse.json({ error: 'Tag limit reached' }, { status: 400 });

    return NextResponse.json({
      success: true,
      addedTags: addedTags.added.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
    });
  } catch (error) {
    if (error instanceof TagLimitError) {
      return NextResponse.json({ error: 'Tag limit reached' }, { status: 400 });
    }
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    unstable_rethrow(error);
    logError('assets:tags-add-failed', error);
    return NextResponse.json(
      { error: 'Failed to add tags to asset' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/assets/[id]/tags - Remove tags from an asset
 */
async function deleteHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const userId = await requireUserIdWithSync();
    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }
    const { tagIds } = await req.json();

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0 || tagIds.length > TAG.maxRequestItems || tagIds.some((value) => !isValidAssetId(value))) {
      return NextResponse.json(
        { error: 'Tag IDs are required' },
        { status: 400 }
      );
    }

    if (!prisma) return enrollmentUnavailableResponse();

    const removed = await withEnrollmentIdentityWriter(prisma, userId, async (tx) => {
      const asset = await tx.asset.findFirst({ where: { id, ownerUserId: userId, deletedAt: null } });
      if (!asset) return false;
      await tx.assetTag.deleteMany({ where: { assetId: id, tagId: { in: tagIds } } });
      return true;
    });
    if (!removed) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    return NextResponse.json({
      success: true,
      message: 'Tags removed from asset',
    });
  } catch (error) {
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    if (isUnauthorizedAuthError(error)) {
      return unauthorizedResponse();
    }

    unstable_rethrow(error);
    logError('assets:tags-remove-failed', error);
    return NextResponse.json(
      { error: 'Failed to remove tags from asset' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:tags:list' });
export const POST = withObservability(postHandler, { operation: 'assets:tags:add' });
export const DELETE = withObservability(deleteHandler, { operation: 'assets:tags:remove' });
