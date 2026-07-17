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
export async function enqueueAssetReplicaCleanup(
  tx: CleanupTransaction,
  assetId: string,
  fallback: AssetDeleteFallback[],
): Promise<StorageReplica[]> {
  const rows = await tx.$queryRawUnsafe<AssetReplicaRow[]>(
    'SELECT provider, source_key, logical_key, delivery_url, active FROM asset_storage_replicas WHERE asset_id=$1',
    assetId,
  );
  const replicas = replicasForPermanentDelete(rows, fallback);
  for (const replica of replicas) {
    await tx.$executeRawUnsafe(
      "INSERT INTO storage_cleanup_outbox (id, asset_id, provider, key, url, action, status, updated_at) VALUES (md5(concat_ws(chr(0), $1, $2, $3, $4, $5)), $1, $2, $3, $4, $5, 'pending', NOW()) ON CONFLICT (id) DO NOTHING",
      assetId,
      replica.provider,
      replica.key,
      replica.url,
      'permanent-delete',
    );
  }
  return replicas;
}

export async function markReplicaCleanupDone(
  db: Pick<Prisma.TransactionClient, '$executeRawUnsafe'>,
  assetId: string,
  replicas: StorageReplica[],
): Promise<void> {
  for (const replica of replicas) {
    await db.$executeRawUnsafe(
      "UPDATE storage_cleanup_outbox SET status='done', claim_owner=NULL, claim_token=NULL, available_at=NOW(), updated_at=NOW() WHERE id=md5(concat_ws(chr(0), $1, $2, $3, $4, $5)) AND status <> 'done'",
      assetId,
      replica.provider,
      replica.key,
      replica.url,
      'permanent-delete',
    );
  }
}
