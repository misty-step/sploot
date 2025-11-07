import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getCacheService } from '@/lib/cache';
import { getAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';

async function getHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
      include: {
        embedding: true,
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
      asset: {
        id: asset.id,
        blobUrl: asset.blobUrl,
        pathname: asset.pathname,
        filename: asset.pathname,
        mime: asset.mime,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        favorite: asset.favorite,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        embedding: asset.embedding,
        tags: asset.tags.map((at: any) => ({
          id: at.tag.id,
          name: at.tag.name,
        })),
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    // Error fetching asset
    return NextResponse.json(
      { error: 'Failed to fetch asset' },
      { status: 500 }
    );
  }
}

async function patchHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }
    const body = await req.json();
    const { favorite, tags } = body;

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const existingAsset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
        deletedAt: null,
      },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (favorite !== undefined) {
      updateData.favorite = favorite;
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: updateData,
      include: {
        embedding: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (tags && Array.isArray(tags)) {
      await prisma.assetTag.deleteMany({
        where: { assetId: id },
      });

      for (const tagName of tags) {
        const tag = await prisma.tag.upsert({
          where: {
            unique_user_tag: {
              ownerUserId: userId,
              name: tagName,
            },
          },
          update: {},
          create: {
            ownerUserId: userId,
            name: tagName,
          },
        });

        await prisma.assetTag.create({
          data: {
            assetId: id,
            tagId: tag.id,
          },
        });
      }
    }

    const updatedAsset = await prisma.asset.findUnique({
      where: { id },
      include: {
        embedding: true,
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    // Invalidate cache after update (favorites affect search results)
    // Clear only asset and search caches (preserve embeddings)
    if (favorite !== undefined) {
      const cache = getCacheService();
      await cache.clear('assets');
      await cache.clear('search');
    }

    return NextResponse.json({
      asset: {
        id: updatedAsset!.id,
        blobUrl: updatedAsset!.blobUrl,
        pathname: updatedAsset!.pathname,
        filename: updatedAsset!.pathname,
        mime: updatedAsset!.mime,
        size: updatedAsset!.size,
        width: updatedAsset!.width,
        height: updatedAsset!.height,
        favorite: updatedAsset!.favorite,
        createdAt: updatedAsset!.createdAt,
        updatedAt: updatedAsset!.updatedAt,
        embedding: updatedAsset!.embedding,
        tags: updatedAsset!.tags.map((at: any) => ({
          id: at.tag.id,
          name: at.tag.name,
        })),
      },
      message: 'Asset updated successfully',
    });
  } catch (error) {
    unstable_rethrow(error);
    // Error updating asset
    return NextResponse.json(
      { error: 'Failed to update asset' },
      { status: 500 }
    );
  }
}

async function deleteHandler(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { userId } = await getAuth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';

    if (!prisma) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const existingAsset = await prisma.asset.findFirst({
      where: {
        id,
        ownerUserId: userId,
      },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    if (permanent) {
      await prisma.assetTag.deleteMany({
        where: { assetId: id },
      });

      await prisma.assetEmbedding.deleteMany({
        where: { assetId: id },
      });

      await prisma.asset.delete({
        where: { id },
      });

      // Invalidate cache after deletion
      // Clear only asset and search caches (preserve embeddings)
      const cache = getCacheService();
      await cache.clear('assets');
      await cache.clear('search');

      return NextResponse.json({
        message: 'Asset permanently deleted',
      });
    } else {
      const asset = await prisma.asset.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });

      // Invalidate cache after soft deletion
      // Clear only asset and search caches (preserve embeddings)
      const cache = getCacheService();
      await cache.clear('assets');
      await cache.clear('search');

      return NextResponse.json({
        message: 'Asset soft deleted',
        asset: {
          id: asset.id,
          deletedAt: asset.deletedAt,
        },
      });
    }
  } catch (error) {
    unstable_rethrow(error);
    // Error deleting asset
    return NextResponse.json(
      { error: 'Failed to delete asset' },
      { status: 500 }
    );
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:detail' });
export const PATCH = withObservability(patchHandler, { operation: 'assets:update' });
export const DELETE = withObservability(deleteHandler, { operation: 'assets:delete' });
