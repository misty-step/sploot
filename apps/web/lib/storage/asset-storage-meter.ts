import type { Prisma } from '@prisma/client';

/**
 * Physical-byte usage for one owner, split by trash state.
 *
 * `activeBytes` — assets not soft-deleted.
 * `trashBytes` — soft-deleted assets that still physically occupy storage
 * until the 30-day purge cron reaps them or the owner permanently deletes
 * them (immediate reclaim). Both buckets count toward quota: a soft delete
 * must not let a user reset their billed footprint for free while the
 * bytes are still sitting in the provider, recoverable, for a month.
 */
export interface PhysicalStorageUsage {
  activeBytes: bigint;
  trashBytes: bigint;
  totalBytes: bigint;
}

type MeterTransaction = Pick<Prisma.TransactionClient, '$queryRaw'>;

interface MeterRow {
  active_bytes: bigint | number | string | null;
  trash_bytes: bigint | number | string | null;
}

function toBigInt(value: bigint | number | string | null | undefined): bigint {
  if (value === null || value === undefined) return BigInt(0);
  if (typeof value === 'bigint') return value;
  return BigInt(value);
}

/**
 * Physical byte usage for `userId`, sourced from the AssetStorageReplica
 * ledger — the table that actually records what the storage provider
 * bills, per original/rendition object, rather than `Asset.size` (original
 * upload bytes only, ignoring thumbnails and every non-canonical replica).
 *
 * Per rendition (original, thumbnail), the query prefers the sum of `size`
 * across that asset's currently-`active` replica rows. An asset that has
 * never had a replica row written for a rendition (created before the
 * ledger existed, or before `storage-ledger backfill` ran) falls back to
 * the best physical measurement already captured on the Asset row itself:
 * `storageSize`/`thumbnailStorageSize` (recorded at ingest or by
 * `storage:portability inventory`), and as a last resort `size` (the
 * pre-processing upload byte count — an approximation for assets that
 * predate every physical-size column). `storage-ledger reconcile` detects
 * drift only; it does not rewrite sizes (repair is a separate operator step).
 * The fallback is per-rendition, not per-asset, so a backfilled original
 * replica row never silently hides an un-backfilled thumbnail's legacy size.
 */
export async function getPhysicalStorageUsage(
  tx: MeterTransaction,
  userId: string,
): Promise<PhysicalStorageUsage> {
  const rows = await tx.$queryRaw<MeterRow[]>`
    SELECT
      COALESCE(SUM(CASE WHEN a.deleted_at IS NULL THEN
        COALESCE(
          (SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id = a.id AND r.rendition = 'original' AND r.active),
          a.storage_size,
          a.size
        )
        + COALESCE(
          (SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id = a.id AND r.rendition = 'thumbnail' AND r.active),
          a.thumbnail_storage_size,
          0
        )
      ELSE 0 END), 0)::bigint AS active_bytes,
      COALESCE(SUM(CASE WHEN a.deleted_at IS NOT NULL THEN
        COALESCE(
          (SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id = a.id AND r.rendition = 'original' AND r.active),
          a.storage_size,
          a.size
        )
        + COALESCE(
          (SELECT SUM(r.size) FROM asset_storage_replicas r WHERE r.asset_id = a.id AND r.rendition = 'thumbnail' AND r.active),
          a.thumbnail_storage_size,
          0
        )
      ELSE 0 END), 0)::bigint AS trash_bytes
    FROM assets a
    WHERE a.owner_user_id = ${userId}
  `;
  const row = rows[0];
  const activeBytes = toBigInt(row?.active_bytes);
  const trashBytes = toBigInt(row?.trash_bytes);
  return { activeBytes, trashBytes, totalBytes: activeBytes + trashBytes };
}
