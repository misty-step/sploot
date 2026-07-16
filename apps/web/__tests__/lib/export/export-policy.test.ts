import { describe, expect, it } from 'vitest';
import {
  EXPORT_EGRESS_WINDOW_FACTOR,
  EXPORT_EGRESS_WINDOW_MS,
  EXPORT_MANIFEST_VERSION,
  EXPORT_PART_MAX_BYTES,
  EXPORT_PART_RESERVE_BASE_BYTES,
  EXPORT_PART_RESERVE_ENTRY_OVERHEAD_BYTES,
  EXPORT_TTL_MS,
  archivePathFor,
  computeCompleteness,
  estimatePartEgressBytes,
  exportEgressAllowance,
  exportEgressWindowAllowance,
  flattenFailures,
  isExportExpired,
  partFileName,
  planExportParts,
  snapshotAssetWhere,
} from '@/lib/export/export-policy';

describe('export policy', () => {
  it('pins a documented manifest version and bounded defaults', () => {
    expect(EXPORT_MANIFEST_VERSION).toBe('1.0');
    expect(EXPORT_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(EXPORT_PART_MAX_BYTES).toBe(256 * 1024 * 1024);
  });

  describe('planExportParts', () => {
    it('returns no parts for an empty library', () => {
      expect(planExportParts([])).toEqual([]);
    });

    it('packs entries into byte-bounded parts preserving id order', () => {
      const entries = [
        { id: 'a1', size: 60 },
        { id: 'a2', size: 30 },
        { id: 'a3', size: 30 },
        { id: 'a4', size: 10 },
      ];
      const parts = planExportParts(entries, 100);
      expect(parts).toEqual([
        { index: 0, afterId: null, count: 2, bytes: 90 },
        { index: 1, afterId: 'a2', count: 2, bytes: 40 },
      ]);
    });

    it('gives an oversized entry its own part instead of dropping it', () => {
      const parts = planExportParts(
        [
          { id: 'a1', size: 500 },
          { id: 'a2', size: 10 },
        ],
        100,
      );
      expect(parts).toEqual([
        { index: 0, afterId: null, count: 1, bytes: 500 },
        { index: 1, afterId: 'a1', count: 1, bytes: 10 },
      ]);
    });

    it('never splits or duplicates entries across parts', () => {
      const entries = Array.from({ length: 57 }, (_, i) => ({
        id: `id${String(i).padStart(3, '0')}`,
        size: 7,
      }));
      const parts = planExportParts(entries, 20);
      const totalCount = parts.reduce((sum, part) => sum + part.count, 0);
      const totalBytes = parts.reduce((sum, part) => sum + part.bytes, 0);
      expect(totalCount).toBe(57);
      expect(totalBytes).toBe(57 * 7);
      // Boundaries chain: each afterId is the last id of the previous window.
      let cursor = 0;
      for (const part of parts) {
        expect(part.afterId).toBe(cursor === 0 ? null : entries[cursor - 1].id);
        cursor += part.count;
      }
    });
  });

  describe('archivePathFor', () => {
    it('maps assets to a stable, extension-typed archive path', () => {
      expect(archivePathFor('ckabc123', 'image/png')).toBe('assets/ckabc123.png');
      expect(archivePathFor('ckabc123', 'image/jpeg')).toBe('assets/ckabc123.jpg');
      expect(archivePathFor('ckabc123', 'video/mp4')).toBe('assets/ckabc123.mp4');
      expect(archivePathFor('ckabc123', 'application/x-unknown')).toBe('assets/ckabc123.bin');
    });

    it('rejects ids that could traverse paths', () => {
      expect(() => archivePathFor('../../etc/passwd', 'image/png')).toThrow();
      expect(() => archivePathFor('a/b', 'image/png')).toThrow();
      expect(() => archivePathFor('', 'image/png')).toThrow();
    });
  });

  it('names parts with 1-based padded ordinals', () => {
    expect(partFileName('exp1', 0, 12)).toBe('sploot-export-exp1-part-001-of-012.zip');
    expect(partFileName('exp1', 11, 12)).toBe('sploot-export-exp1-part-012-of-012.zip');
  });

  describe('computeCompleteness', () => {
    it('is complete only when every part served and no failures', () => {
      expect(computeCompleteness(2, [0, 1], {})).toEqual({ complete: true, reasons: [] });
    });

    it('reports unserved parts explicitly', () => {
      const result = computeCompleteness(3, [0], {});
      expect(result.complete).toBe(false);
      expect(result.reasons).toContain('parts_not_fully_downloaded');
    });

    it('reports failed or missing objects explicitly', () => {
      const result = computeCompleteness(1, [0], {
        '0': [{ assetId: 'a1', archivePath: 'assets/a1.png', reason: 'object_missing' }],
      });
      expect(result.complete).toBe(false);
      expect(result.reasons).toContain('objects_missing_or_failed');
    });

    it('a zero-part (empty library) export is complete with no failures', () => {
      expect(computeCompleteness(0, [], {})).toEqual({ complete: true, reasons: [] });
    });
  });

  it('flattens per-part failures deterministically', () => {
    const failures = flattenFailures({
      '1': [{ assetId: 'b', archivePath: 'assets/b.png', reason: 'checksum_mismatch' }],
      '0': [{ assetId: 'a', archivePath: 'assets/a.png', reason: 'object_missing' }],
    });
    expect(failures.map((f) => f.assetId)).toEqual(['a', 'b']);
  });

  it('bounds egress to a small multiple of the library size', () => {
    const allowance = exportEgressAllowance(BigInt(1000));
    expect(allowance).toBe(BigInt(3000) + BigInt(128 * 1024 * 1024));
  });

  describe('egress reservations', () => {
    it('reserves a deterministic, conservative upper bound for a part', () => {
      const boundary = { index: 0, afterId: null, count: 3, bytes: 1_000_000 };
      const reserve = estimatePartEgressBytes(boundary);
      expect(reserve).toBe(
        BigInt(1_000_000) +
          BigInt(3 * EXPORT_PART_RESERVE_ENTRY_OVERHEAD_BYTES) +
          BigInt(EXPORT_PART_RESERVE_BASE_BYTES),
      );
      // Conservative: always at least the raw entry bytes.
      expect(reserve > BigInt(boundary.bytes)).toBe(true);
      // Deterministic: same boundary, same reservation.
      expect(estimatePartEgressBytes(boundary)).toBe(reserve);
    });

    it('bounds tenant egress over a rolling window to a fixed multiple of one export allowance', () => {
      expect(EXPORT_EGRESS_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
      expect(EXPORT_EGRESS_WINDOW_FACTOR).toBe(2);
      expect(exportEgressWindowAllowance(BigInt(1000))).toBe(
        exportEgressAllowance(BigInt(1000)) * BigInt(2),
      );
    });

    it('a part reservation always fits a fresh export allowance', () => {
      // Worst case: one part carrying the entire library.
      const boundary = { index: 0, afterId: null, count: 100_000, bytes: 256 * 1024 * 1024 };
      expect(
        estimatePartEgressBytes(boundary) <= exportEgressAllowance(BigInt(boundary.bytes)),
      ).toBe(true);
    });
  });

  it('expires exports strictly after expiresAt', () => {
    const expiresAt = new Date('2026-07-15T00:00:00Z');
    expect(isExportExpired(expiresAt, new Date('2026-07-14T23:59:59Z'))).toBe(false);
    expect(isExportExpired(expiresAt, new Date('2026-07-15T00:00:01Z'))).toBe(true);
  });

  it('freezes the snapshot membership predicate', () => {
    const snapshotAt = new Date('2026-07-15T12:00:00Z');
    expect(snapshotAssetWhere('user-1', snapshotAt)).toEqual({
      ownerUserId: 'user-1',
      createdAt: { lte: snapshotAt },
      OR: [{ deletedAt: null }, { deletedAt: { gt: snapshotAt } }],
    });
  });
});
