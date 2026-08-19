import { prisma } from '@/lib/db';
import { mapAssetTags } from '@/lib/asset-dto';
import type { AssetTag } from '@/lib/types';

type AssetTagJoinRow = {
  assetId: string;
  tag: { id: string; name: string };
};

/**
 * Group `{ assetId, tag }` join rows into the per-asset tag lists that
 * `toGridAsset` accepts. Callers never have to re-implement the bucket.
 */
export function groupAssetTagsById(
  rows: AssetTagJoinRow[],
): Record<string, AssetTag[]> {
  const rowsByAssetId: Record<string, AssetTagJoinRow[]> = {};
  for (const row of rows) {
    (rowsByAssetId[row.assetId] ??= []).push(row);
  }
  return Object.fromEntries(
    Object.entries(rowsByAssetId).map(([assetId, assetRows]) => [
      assetId,
      mapAssetTags(assetRows),
    ]),
  );
}

/**
 * Load tags for a page of assets in one query.
 *
 * Gallery list, semantic search, and advanced search all attach the same
 * `{ id, name }` tag DTO to grid assets. Search used to do that with one
 * query per hit; this is the single batched seam those paths share.
 */
export async function loadTagsByAssetId(
  assetIds: string[],
): Promise<Record<string, AssetTag[]>> {
  if (assetIds.length === 0) return {};

  const rows = await prisma!.assetTag.findMany({
    where: { assetId: { in: assetIds } },
    select: {
      assetId: true,
      tag: { select: { id: true, name: true } },
    },
  });

  return groupAssetTagsById(rows);
}
