import type { Prisma } from '@prisma/client';
import type { StorageReplica } from './object-store';

export interface AssetReplicaRow {
  provider: string;
  source_key: string | null;
  logical_key: string;
  delivery_url: string;
  active: boolean;
}

export interface AssetDeleteFallback {
  provider: string;
  key: string;
  url: string;
}

type CleanupTransaction = Pick<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>;

/**
 * Build a provider-accurate, duplicate-free deletion receipt. Replica rows are
 * authoritative even when inactive: every provider object must be tombstoned.
 * The legacy fallback is permitted only when no replica rows exist.
 */
export function replicasForPermanentDelete(rows: AssetReplicaRow[], fallback: AssetDeleteFallback[]): StorageReplica[] {
  const candidates = rows.length > 0 ? rows.map(row => ({
    provider: row.provider,
    key: row.provider === 'vercel' ? (row.source_key ?? row.logical_key) : row.logical_key,
    url: row.delivery_url,
  })) : fallback;
  const unique = new Map<string, StorageReplica>();
  for (const replica of candidates) {
    if (!replica.provider || !replica.key || !replica.url) continue;
    unique.set(replica.provider + '\0' + replica.key + '\0' + replica.url, replica);
  }
  return [...unique.values()];
}

/**
 * Enumerate every replica and enqueue a durable provider-local cleanup in the
 * same transaction that tombstones/removes an asset. This is the one authority
 * used by explicit DELETE and the retention purge; outbox rows survive asset
 * deletion and are idempotent via their deterministic identity.
 */
/**
 * A physical object is fenced from deletion whenever any other still-live
 * asset also references it (by exact provider+delivery-URL identity via its
 * replica ledger, or via the raw legacy Asset columns before any replica row
 * exists). Cutover explicitly models more than one live Asset row sharing a
 * single legacy storage key/URL (see storage-portability.ts commitCutover's
 * per-manifest-entry `assets` loop); deletion must honor the same invariant
 * or it would physically destroy an object a sibling asset still serves.
 */
async function hasLiveSharedReference(
  tx: CleanupTransaction,
  assetId: string,
  replica: StorageReplica,
): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<Array<{ shared: boolean }>>(
    `SELECT (
       EXISTS (
         SELECT 1 FROM asset_storage_replicas r
         JOIN assets a ON a.id = r.asset_id
         WHERE r.asset_id <> $1 AND a.deleted_at IS NULL
           AND r.provider = $2 AND r.delivery_url = $3
       )
       OR EXISTS (
         SELECT 1 FROM assets a2
         WHERE a2.id <> $1 AND a2.deleted_at IS NULL
           AND (a2.blob_url = $3 OR a2.thumbnail_url = $3)
       )
     ) AS shared`,
    assetId,
    replica.provider,
    replica.url,
  );
  return rows[0]?.shared === true;
}

/**
 * Fence-check one replica and, if no other live asset still references it,
 * durably enqueue its provider cleanup under `action`. This is the single
 * shared-reference-aware outbox seam every deletion path (permanent-delete's
 * multi-replica sweep below, and the old-thumbnail/orphaned-replica cleanup
 * in the thumbnail regen cron) goes through — never a bespoke point-in-time
 * check duplicated per caller. Returns whether the row was enqueued (false
 * means fenced: another live asset still owns this physical object, so
 * deletion is correctly skipped rather than breaking that sibling asset).
 */
export async function enqueueReplicaCleanup(
  tx: CleanupTransaction,
  assetId: string,
  replica: StorageReplica,
  action: string,
): Promise<boolean> {
  if (await hasLiveSharedReference(tx, assetId, replica)) return false;
  await tx.$executeRawUnsafe(
    "INSERT INTO storage_cleanup_outbox (id, asset_id, provider, key, url, action, status, updated_at) VALUES (md5(concat_ws(chr(0), $1, $2, $3, $4, $5)), $1, $2, $3, $4, $5, 'pending', NOW()) ON CONFLICT (id) DO NOTHING",
    assetId,
    replica.provider,
    replica.key,
    replica.url,
    action,
  );
  return true;
}

export async function enqueueAssetReplicaCleanup(
  tx: CleanupTransaction,
  assetId: string,
  fallback: AssetDeleteFallback[],
): Promise<StorageReplica[]> {
  const rows = await tx.$queryRawUnsafe<AssetReplicaRow[]>(
    'SELECT provider, source_key, logical_key, delivery_url, active FROM asset_storage_replicas WHERE asset_id=$1',
    assetId,
  );
  const candidates = replicasForPermanentDelete(rows, fallback);
  const replicas: StorageReplica[] = [];
  for (const replica of candidates) {
    if (await enqueueReplicaCleanup(tx, assetId, replica, 'permanent-delete')) replicas.push(replica);
  }
  return replicas;
}

export async function markReplicaCleanupDone(
  db: Pick<Prisma.TransactionClient, '$executeRawUnsafe'>,
  assetId: string,
  replicas: StorageReplica[],
  action: string = 'permanent-delete',
): Promise<void> {
  for (const replica of replicas) {
    await db.$executeRawUnsafe(
      "UPDATE storage_cleanup_outbox SET status='done', claim_owner=NULL, claim_token=NULL, available_at=NOW(), updated_at=NOW() WHERE id=md5(concat_ws(chr(0), $1, $2, $3, $4, $5)) AND status <> 'done'",
      assetId,
      replica.provider,
      replica.key,
      replica.url,
      action,
    );
  }
}
