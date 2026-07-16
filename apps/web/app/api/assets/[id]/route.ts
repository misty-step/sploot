import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { getCacheService } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { invalidateSlugCache } from '@/lib/slug-cache';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { acquireEnrollmentIdentityWriterLock, enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { ConfiguredStorageWriter } from '@/lib/storage/object-store';

async function getHandler(
  req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    const userId = principal.userId;

    const params = await context.params;
    const id = params?.id;

    if (!id) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    if (!prisma) return enrollmentUnavailableResponse();

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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    // Error fetching asset
    return NextResponse.json(
      { error: 'Failed to fetch asset' },
      { status: 500 }
    );
  }
}

async function patchHandler(
  req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    const userId = principal.userId;

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

    if (!prisma) return enrollmentUnavailableResponse();

    const updatedAsset = await prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const existingAsset = await tx.asset.findFirst({
        where: { id, ownerUserId: userId, deletedAt: null },
      });
      if (!existingAsset) return null;

      const updateData: { favorite?: boolean } = {};
      if (typeof favorite === 'boolean') updateData.favorite = favorite;
      await tx.asset.update({ where: { id }, data: updateData });

      if (tags && Array.isArray(tags)) {
        await tx.assetTag.deleteMany({ where: { assetId: id } });
        for (const tagName of tags) {
          if (typeof tagName !== 'string') continue;
          const tag = await tx.tag.upsert({
            where: { unique_user_tag: { ownerUserId: userId, name: tagName } },
            update: {},
            create: { ownerUserId: userId, name: tagName },
          });
          await tx.assetTag.create({ data: { assetId: id, tagId: tag.id } });
        }
      }

      return tx.asset.findUnique({
        where: { id },
        include: { embedding: true, tags: { include: { tag: true } } },
      });
    });

    if (!updatedAsset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

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
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
    // Error updating asset
    return NextResponse.json(
      { error: 'Failed to update asset' },
      { status: 500 }
    );
  }
}

async function deleteHandler(
  req: NextRequest,
  context: RouteContext,
  { principal }: AuthenticatedApiContext,
) {
  try {
    const userId = principal.userId;

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

    if (!prisma) return enrollmentUnavailableResponse();

    if (permanent) {
      const existingAsset = await prisma.asset.findFirst({ where: { id, ownerUserId: userId } });
      if (!existingAsset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      const storage = new ConfiguredStorageWriter();
      const keys = [
        existingAsset.storageKey ? { provider: existingAsset.storageProvider, key: existingAsset.storageKey } : null,
        existingAsset.thumbnailStorageKey ? { provider: existingAsset.storageProvider, key: existingAsset.thumbnailStorageKey } : null,
      ].filter((entry): entry is { provider: string; key: string } => Boolean(entry));
      const fallbackUrls = [
        !existingAsset.storageKey ? existingAsset.blobUrl : null,
        !existingAsset.thumbnailStorageKey ? existingAsset.thumbnailUrl : null,
      ].filter((url): url is string => Boolean(url));
      if (storage.deleteKey) await Promise.all(keys.map(entry => storage.deleteKey!(entry.provider, entry.key)));
      await Promise.all(fallbackUrls.map(url => storage.deleteUrl(url)));

      const permanentResult = await prisma.$transaction(async (tx) => {
        await acquireEnrollmentIdentityWriterLock(tx, userId);
        const lockedAsset = await tx.asset.findFirst({ where: { id, ownerUserId: userId } });
        if (!lockedAsset) return null;
        await tx.assetTag.deleteMany({ where: { assetId: id } });
        await tx.assetEmbedding.deleteMany({ where: { assetId: id } });
        await tx.asset.delete({ where: { id } });
        return { kind: 'permanent' as const, shareSlug: lockedAsset.shareSlug };
      });
      if (!permanentResult) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      await invalidateDeletedAssetCaches(permanentResult.shareSlug);
      return NextResponse.json({ message: 'Asset permanently deleted' });
    }

    const result = await prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const existingAsset = await tx.asset.findFirst({ where: { id, ownerUserId: userId } });
      if (!existingAsset) return null;

      const asset = await tx.asset.update({ where: { id }, data: { deletedAt: new Date() } });
      return { kind: 'soft' as const, shareSlug: existingAsset.shareSlug, asset };
    });

    if (!result) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    await invalidateDeletedAssetCaches(result.shareSlug);

    return NextResponse.json({
      message: 'Asset soft deleted',
      asset: { id: result.asset.id, deletedAt: result.asset.deletedAt },
    });
  } catch (error) {
    unstable_rethrow(error);
    const enrollmentResponse = enrollmentResponseForError(error);
    if (enrollmentResponse) return enrollmentResponse;
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

export const GET = withObservability(withAuthenticatedApi(getHandler), { operation: 'assets:detail' });
export const PATCH = withObservability(withAuthenticatedApi(patchHandler), { operation: 'assets:update' });
export const DELETE = withObservability(withAuthenticatedApi(deleteHandler), { operation: 'assets:delete' });
