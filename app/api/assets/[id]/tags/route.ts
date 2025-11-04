import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { requireUserIdWithSync } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';

/**
 * GET /api/assets/[id]/tags - Get tags for a specific asset
 */
async function getHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserIdWithSync();
    const { id } = await params;

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

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
    unstable_rethrow(error);
    console.error('Error fetching asset tags:', error);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserIdWithSync();
    const { id } = await params;
    const { tagIds, tagNames } = await req.json();

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Verify asset ownership
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const addedTags = [];

    // Handle tag IDs
    if (tagIds && Array.isArray(tagIds)) {
      for (const tagId of tagIds) {
        // Verify tag ownership
        const tag = await prisma.tag.findFirst({
          where: {
            id: tagId,
            ownerUserId: userId,
          },
        });

        if (tag) {
          // Check if association already exists
          const existingAssociation = await prisma.assetTag.findUnique({
            where: {
              assetId_tagId: {
                assetId: id,
                tagId: tagId,
              },
            },
          });

          if (!existingAssociation) {
            await prisma.assetTag.create({
              data: {
                assetId: id,
                tagId: tagId,
              },
            });
            addedTags.push(tag);
          }
        }
      }
    }

    // Handle tag names (create tags if they don't exist)
    if (tagNames && Array.isArray(tagNames)) {
      for (const tagName of tagNames) {
        const normalizedName = tagName.trim().toLowerCase();

        // Find or create tag
        let tag = await prisma.tag.findFirst({
          where: {
            ownerUserId: userId,
            name: normalizedName,
          },
        });

        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              ownerUserId: userId,
              name: normalizedName,
            },
          });
        }

        // Check if association already exists
        const existingAssociation = await prisma.assetTag.findUnique({
          where: {
            assetId_tagId: {
              assetId: id,
              tagId: tag.id,
            },
          },
        });

        if (!existingAssociation) {
          await prisma.assetTag.create({
            data: {
              assetId: id,
              tagId: tag.id,
            },
          });
          addedTags.push(tag);
        }
      }
    }

    return NextResponse.json({
      success: true,
      addedTags: addedTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      })),
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error adding tags to asset:', error);
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserIdWithSync();
    const { id } = await params;
    const { tagIds } = await req.json();

    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      return NextResponse.json(
        { error: 'Tag IDs are required' },
        { status: 400 }
      );
    }

    if ( !prisma) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 503 }
      );
    }

    // Verify asset ownership
    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Remove tag associations
    await prisma.assetTag.deleteMany({
      where: {
        assetId: id,
        tagId: {
          in: tagIds,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tags removed from asset',
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error removing tags from asset:', error);
    return NextResponse.json(
      { error: 'Failed to remove tags from asset' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:tags:list' });
export const POST = withObservability(postHandler, { operation: 'assets:tags:add' });
export const DELETE = withObservability(deleteHandler, { operation: 'assets:tags:remove' });
