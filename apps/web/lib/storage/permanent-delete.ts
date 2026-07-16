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

/**
 * Build a provider-accurate, duplicate-free deletion receipt. Legacy Vercel
 * rows must use their physical source key only as metadata; deletion itself
 * uses the recorded URL because inventory can assign a different logical key.
 * Target stores use the canonical logical key, never a legacy source key.
 */
export function replicasForPermanentDelete(rows: AssetReplicaRow[], fallback: AssetDeleteFallback[]): StorageReplica[] {
  const candidates = rows.length > 0
    ? rows.map(row => ({ provider: row.provider, key: row.provider === 'vercel' ? (row.source_key ?? row.logical_key) : row.logical_key, url: row.delivery_url }))
    : fallback;
  const unique = new Map<string, StorageReplica>();
  for (const replica of candidates) {
    if (!replica.provider || !replica.key || !replica.url) continue;
    unique.set(`${replica.provider}\0${replica.key}\0${replica.url}`, replica);
  }
  return [...unique.values()];
}
