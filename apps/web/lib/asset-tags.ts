import { prisma } from '@/lib/db';
import { mapAssetTags } from '@/lib/asset-dto';
import type { AssetTag } from '@/lib/types';

/**
 * Batched tag attachment for grid/search read paths.
 *
 * Callers already have a page of asset ids. They should not know Prisma
 * join rows, `include` vs `select`, or how to bucket those rows back onto
 * assets. Empty id lists skip the query entirely so `IN ()` never leaks
 * into SQL. See sploot-049 (`toGridAsset` / `mapAssetTags`) for the DTO
 * half of this contract.
 */
type AssetTagJoinRow = {
  assetId: string;
  tag: { id: string; name: string };
};

function groupAssetTagsById(rows: AssetTagJoinRow[]): Record<string, AssetTag[]> {
  const rowsByAssetId: Record<string, AssetTagJoinRow[]> = {};
  for (const row of rows) {
    (rowsByAssetId[row.assetId] ??= []).push(row);
  }
  return Object.fromEntries(
    Object.entries(rowsByAssetId).map(([assetId, grouped]) => [assetId, mapAssetTags(grouped)]),
  );
}

export async function loadTagsByAssetId(
  assetIds: string[],
): Promise<Record<string, AssetTag[]>> {
  if (assetIds.length === 0) {
    return {};
  }

  const rows = await prisma.assetTag.findMany({
    where: { assetId: { in: assetIds } },
    select: {
      assetId: true,
      tag: { select: { id: true, name: true } },
    },
  });

  return groupAssetTagsById(rows);
}
