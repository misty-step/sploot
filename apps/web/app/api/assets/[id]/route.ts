import { NextRequest, NextResponse } from 'next/server';
import { TAG, isValidAssetId, isValidTagName } from '@sploot/common';
import { unstable_rethrow } from 'next/navigation';
import { getCacheService } from '@/lib/cache';
import { prisma } from '@/lib/db';
import { invalidateSlugCache } from '@/lib/slug-cache';
import { enqueueAssetReplicaCleanup, markReplicaCleanupDone } from '@/lib/storage/permanent-delete';
import { withObservability } from '@/lib/with-observability';
import { withAuthenticatedApi } from '@/lib/auth/with-authenticated-api';
import type { AuthenticatedApiContext } from '@/lib/auth/with-authenticated-api';
import type { RouteContext } from '@/lib/with-observability';
import { acquireEnrollmentIdentityWriterLock, enrollmentResponseForError, enrollmentUnavailableResponse } from '@/lib/enrollment/enrollment-policy';
import { ConfiguredStorageWriter } from '@/lib/storage/object-store';

class TagLimitError extends Error {}


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
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
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
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }
    const body = await req.json();
    const { favorite, tags } = body;
    if (tags !== undefined && (!Array.isArray(tags) || tags.length > TAG.maxPerAsset || tags.some((value) => !isValidTagName(value)))) {
      return NextResponse.json({ error: 'Tags are invalid or too many' }, { status: 400 });
    }

    if (!prisma) return enrollmentUnavailableResponse();

    const updatedAsset = await prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, userId);
      const existingAsset = await tx.asset.findFirst({
        where: { id, ownerUserId: userId, deletedAt: null },
      });
      if (!existingAsset) return { kind: 'missing' as const };

      const updateData: { favorite?: boolean } = {};
      if (typeof favorite === 'boolean') updateData.favorite = favorite;
      await tx.asset.update({ where: { id }, data: updateData });

      if (tags && Array.isArray(tags)) {
        await tx.assetTag.deleteMany({ where: { assetId: id } });
        let userTagCount = await tx.tag.count({ where: { ownerUserId: userId } });
        const normalizedTags = Array.from(new Set(tags.map((tagName) => tagName.trim().toLowerCase())));
        for (const normalizedName of normalizedTags) {
          const existingTag = await tx.tag.findFirst({ where: { ownerUserId: userId, name: normalizedName } });
          if (!existingTag && userTagCount >= TAG.maxPerUser) {
            throw new TagLimitError('tag limit reached');
          }
          const tag = existingTag ?? await tx.tag.create({ data: { ownerUserId: userId, name: normalizedName } });
          if (!existingTag) userTagCount += 1;
          await tx.assetTag.create({ data: { assetId: id, tagId: tag.id } });
        }
      }

      const asset = await tx.asset.findUnique({
        where: { id },
        include: { embedding: true, tags: { include: { tag: true } } },
      });
      return { kind: 'ok' as const, asset };
    });

    if (updatedAsset.kind === 'missing' || !updatedAsset.asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    const updatedAssetRow = updatedAsset.asset;

    // Invalidate cache after update (favorites affect search results)
    // Clear only asset and search caches (preserve embeddings)
    if (favorite !== undefined) {
      const cache = getCacheService();
      await cache.clear('assets');
      await cache.clear('search');
    }

    return NextResponse.json({
      asset: {
        id: updatedAssetRow.id,
        blobUrl: updatedAssetRow.blobUrl,
        pathname: updatedAssetRow.pathname,
        filename: updatedAssetRow.pathname,
        mime: updatedAssetRow.mime,
        size: updatedAssetRow.size,
        width: updatedAssetRow.width,
        height: updatedAssetRow.height,
        favorite: updatedAssetRow.favorite,
        createdAt: updatedAssetRow.createdAt,
        updatedAt: updatedAssetRow.updatedAt,
        embedding: updatedAssetRow.embedding,
        tags: updatedAssetRow.tags.map((at: any) => ({
          id: at.tag.id,
          name: at.tag.name,
        })),
      },
      message: 'Asset updated successfully',
    });
  } catch (error) {
    if (error instanceof TagLimitError) {
      return NextResponse.json({ error: 'Tag limit reached' }, { status: 400 });
    }
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
    if (!isValidAssetId(id)) {
      return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }
    const { searchParams } = new URL(req.url);
    const permanent = searchParams.get('permanent') === 'true';

    if (!prisma) return enrollmentUnavailableResponse();

    if (permanent) {
      const storage = new ConfiguredStorageWriter();
      const tombstone = await prisma.$transaction(async (tx) => {
        await acquireEnrollmentIdentityWriterLock(tx, userId);
        const asset = await tx.asset.findFirst({ where: { id, ownerUserId: userId } });
        if (!asset) return null;
        // A permanent delete destroys snapshot membership. Cancel active
        // exports under the same identity lock before tombstoning the asset.
        await tx.libraryExport.updateMany({
          where: { ownerUserId: userId, status: 'active' },
          data: { status: 'canceled' },
        });
        const fallback = [
          { provider: asset.storageProvider ?? 'vercel', key: asset.storageSourceKey ?? asset.storageKey ?? asset.pathname, url: asset.blobUrl },
          asset.thumbnailUrl ? { provider: asset.storageProvider ?? 'vercel', key: asset.thumbnailStorageSourceKey ?? asset.thumbnailStorageKey ?? asset.thumbnailPath ?? asset.pathname, url: asset.thumbnailUrl } : null,
        ].filter((entry): entry is { provider: string; key: string; url: string } => Boolean(entry));
        const replicas = await enqueueAssetReplicaCleanup(tx, id, fallback);
        await tx.asset.update({ where: { id }, data: { deletedAt: new Date() } });
        return { shareSlug: asset.shareSlug, replicas };
      });
      if (!tombstone) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      try {
        let deletionError: unknown;
        for (const replica of tombstone.replicas) {
          try {
            if (storage.deleteReplica) await storage.deleteReplica(replica);
            else if (storage.deleteKey) await storage.deleteKey(replica.provider, replica.key);
            else await storage.deleteUrl(replica.url);
          } catch (error) {
            deletionError ??= error;
          }
        }
        if (deletionError) throw deletionError;
        await prisma.$transaction(async (tx) => {
          await acquireEnrollmentIdentityWriterLock(tx, userId);
          const locked = await tx.asset.findFirst({ where: { id, ownerUserId: userId, deletedAt: { not: null } } });
          if (!locked) return;
          await tx.assetTag.deleteMany({ where: { assetId: id } });
          await tx.assetEmbedding.deleteMany({ where: { assetId: id } });
          await markReplicaCleanupDone(tx, id, tombstone.replicas);
          await tx.asset.delete({ where: { id } });
        });
      } catch (error) {
        return NextResponse.json({ error: 'Asset tombstoned; cleanup pending', detail: error instanceof Error ? error.message : String(error) }, { status: 202 });
      }
      await invalidateDeletedAssetCaches(tombstone.shareSlug);
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
