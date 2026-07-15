import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getCacheService } from '@/lib/cache';
import { getAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { invalidateSlugCache } from '@/lib/slug-cache';
import { withObservability } from '@/lib/with-observability';
import type { RouteContext } from '@/lib/with-observability';
import { normalizeAssetToGridDto } from '@/lib/asset-grid-dto';
import type { AssetDetailPatchResponse, AssetDetailResponse } from '@/lib/types';

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
      select: {
        id: true, blobUrl: true, thumbnailUrl: true, pathname: true, mime: true,
        size: true, width: true, height: true, favorite: true, createdAt: true,
        embedding: { select: { status: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const responseBody: AssetDetailResponse = {
      asset: normalizeAssetToGridDto(asset as any, {
        filename: asset.pathname ?? undefined,
        embeddingStatus: asset.embedding?.status ?? undefined,
        tags: {
          tags: asset.tags.map((at) => ({
            id: at.tag.id,
            name: at.tag.name,
          })),
        },
      }),
    };
    return NextResponse.json(responseBody);
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

    const updateData: { favorite?: boolean } = {};
    if (favorite !== undefined) {
      updateData.favorite = favorite;
    }

    await prisma.asset.update({
      where: { id },
      data: updateData,
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
      select: {
        id: true, blobUrl: true, thumbnailUrl: true, pathname: true, mime: true,
        size: true, width: true, height: true, favorite: true, createdAt: true,
        embedding: { select: { status: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    if (!updatedAsset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 },
      );
    }

    // Invalidate cache after update (favorites affect search results)
    // Clear only asset and search caches (preserve embeddings)
    if (favorite !== undefined) {
      const cache = getCacheService();
      await cache.clear('assets');
      await cache.clear('search');
    }

    const responseBody: AssetDetailPatchResponse = {
      asset: normalizeAssetToGridDto(updatedAsset as any, {
        filename: updatedAsset.pathname ?? undefined,
        embeddingStatus: updatedAsset.embedding?.status ?? undefined,
        tags: {
          tags: updatedAsset.tags.map((at) => ({
            id: at.tag.id,
            name: at.tag.name,
          })),
        },
      }),
      message: 'Asset updated successfully',
    };
    return NextResponse.json(responseBody);
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

      await invalidateDeletedAssetCaches(existingAsset.shareSlug);

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

      await invalidateDeletedAssetCaches(existingAsset.shareSlug);

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

async function invalidateDeletedAssetCaches(shareSlug: string | null): Promise<void> {
  const cache = getCacheService();
  await cache.clear('assets');
  await cache.clear('search');

  if (shareSlug) {
    await invalidateSlugCache(shareSlug);
  }
}

export const GET = withObservability(getHandler, { operation: 'assets:detail' });
export const PATCH = withObservability(patchHandler, { operation: 'assets:update' });
export const DELETE = withObservability(deleteHandler, { operation: 'assets:delete' });
