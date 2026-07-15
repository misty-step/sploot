/**
 * Deterministic policy for complete-library exports (Powder card sploot-057).
 *
 * Everything a correct export depends on — snapshot membership, part
 * boundaries, archive naming, completeness, expiry, and egress bounds — is
 * pure code here so routes and services stay thin and the rules stay
 * testable without a database.
 *
 * Manifest stability contract: `EXPORT_MANIFEST_VERSION` names the schema
 * documented in `apps/web/docs/EXPORT.md`. Additive changes bump the minor
 * version; breaking changes bump the major version.
 */

export const EXPORT_MANIFEST_VERSION = '1.0';

/** How long an export session (and its download capabilities) stays valid. */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/** Byte budget per zip part. A part always contains at least one asset. */
export const EXPORT_PART_MAX_BYTES = 256 * 1024 * 1024;

/**
 * Egress cost bound: an export may stream at most
 * `factor * totalOriginalBytes + slack` bytes before further downloads are
 * refused. The factor covers legitimate part retries; the slack covers zip
 * framing and manifest downloads for small libraries.
 */
export const EXPORT_EGRESS_FACTOR = 3;
export const EXPORT_EGRESS_SLACK_BYTES = 128 * 1024 * 1024;

/** Page size for keyset scans while planning and streaming manifests. */
export const EXPORT_SCAN_PAGE_SIZE = 1000;

export type ExportFailureReason =
  | 'object_missing'
  | 'object_fetch_failed'
  | 'object_url_rejected'
  | 'checksum_mismatch';

export interface ExportFailure {
  assetId: string;
  archivePath: string;
  reason: ExportFailureReason;
}

/** Failures keyed by part index (as a string, for jsonb paths). */
export type ExportFailuresByPart = Record<string, ExportFailure[]>;

export interface ExportPartBoundary {
  index: number;
  /** Exclusive keyset cursor: the last asset id of the previous part. */
  afterId: string | null;
  count: number;
  bytes: number;
}

export interface ExportEntrySeed {
  id: string;
  size: number;
}

export type ExportIncompleteReason =
  | 'parts_not_fully_downloaded'
  | 'objects_missing_or_failed';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

const SAFE_ASSET_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Pack snapshot entries (already in ascending id order) into byte-bounded
 * parts. Deterministic: the same entry list always yields the same
 * boundaries, so parts can be re-streamed idempotently for retry/resume.
 */
export function planExportParts(
  entries: Iterable<ExportEntrySeed>,
  maxPartBytes: number = EXPORT_PART_MAX_BYTES,
): ExportPartBoundary[] {
  const parts: ExportPartBoundary[] = [];
  let current: ExportPartBoundary | null = null;
  let previousId: string | null = null;

  for (const entry of entries) {
    const startsNewPart =
      current === null || (current.count > 0 && current.bytes + entry.size > maxPartBytes);

    if (startsNewPart) {
      current = {
        index: parts.length,
        afterId: previousId,
        count: 0,
        bytes: 0,
      };
      parts.push(current);
    }

    current!.count += 1;
    current!.bytes += entry.size;
    previousId = entry.id;
  }

  return parts;
}

/**
 * Archive path for an asset's original bytes. Asset ids are cuids, but the
 * charset is enforced here anyway so a corrupted row can never traverse
 * paths inside the archive.
 */
export function archivePathFor(assetId: string, mime: string): string {
  if (!SAFE_ASSET_ID.test(assetId)) {
    throw new Error(`unsafe asset id for archive path: ${JSON.stringify(assetId)}`);
  }
  const extension = MIME_EXTENSIONS[mime] ?? 'bin';
  return `assets/${assetId}.${extension}`;
}

export function partFileName(exportId: string, index: number, partCount: number): string {
  const ordinal = String(index + 1).padStart(3, '0');
  const total = String(partCount).padStart(3, '0');
  return `sploot-export-${exportId}-part-${ordinal}-of-${total}.zip`;
}

export function manifestFileName(exportId: string): string {
  return `sploot-export-${exportId}-manifest.json`;
}

export function flattenFailures(failures: ExportFailuresByPart): ExportFailure[] {
  return Object.keys(failures)
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((key) => failures[key] ?? []);
}

/**
 * An export is complete only when every part has been fully streamed at
 * least once AND no object failed or went missing. Anything else must be
 * reported explicitly — partial success never masquerades as complete.
 */
export function computeCompleteness(
  partCount: number,
  servedParts: number[],
  failures: ExportFailuresByPart,
): { complete: boolean; reasons: ExportIncompleteReason[] } {
  const served = new Set(servedParts);
  const reasons: ExportIncompleteReason[] = [];

  for (let index = 0; index < partCount; index += 1) {
    if (!served.has(index)) {
      reasons.push('parts_not_fully_downloaded');
      break;
    }
  }

  if (flattenFailures(failures).length > 0) {
    reasons.push('objects_missing_or_failed');
  }

  return { complete: reasons.length === 0, reasons };
}

export function exportEgressAllowance(totalOriginalBytes: bigint | number): bigint {
  return (
    BigInt(totalOriginalBytes) * BigInt(EXPORT_EGRESS_FACTOR) +
    BigInt(EXPORT_EGRESS_SLACK_BYTES)
  );
}

export function isExportExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return now.getTime() > expiresAt.getTime();
}

/**
 * Frozen snapshot membership: assets that existed at snapshot time and were
 * not already soft-deleted. Stable under concurrent uploads (createdAt >
 * snapshotAt excluded), soft-deletes (deletedAt > snapshotAt still
 * included), and restores (deletedAt back to null still included). Hard
 * purges only touch assets soft-deleted 30+ days — impossible inside the
 * 24h export TTL — so recomputing this predicate always yields the same
 * entry set for a given export.
 */
export function snapshotAssetWhere(userId: string, snapshotAt: Date) {
  return {
    ownerUserId: userId,
    createdAt: { lte: snapshotAt },
    OR: [{ deletedAt: null }, { deletedAt: { gt: snapshotAt } }],
  };
}
