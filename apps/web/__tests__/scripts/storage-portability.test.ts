import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();
const mockAssetFindMany = vi.fn();
const mockAssetUpdate = vi.fn();
const mockInventoryStateUpsert = vi.fn();
const mockMigrationEntryFindMany = vi.fn();

vi.mock('../../lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    asset: {
      findMany: (...args: unknown[]) => mockAssetFindMany(...args),
      update: (...args: unknown[]) => mockAssetUpdate(...args),
    },
    storageInventoryState: { upsert: (...args: unknown[]) => mockInventoryStateUpsert(...args) },
    storageMigrationEntry: { findMany: (...args: unknown[]) => mockMigrationEntryFindMany(...args) },
  },
}));

const mockGetSourceKey = vi.fn();
vi.mock('../../lib/storage/object-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/object-store')>();
  class MockVercelObjectStore {
    getSourceKey(...args: unknown[]) {
      return mockGetSourceKey(...args);
    }
  }
  return {
    ...actual,
    VercelObjectStore: MockVercelObjectStore,
  };
});

const mockSeedMigrationManifest = vi.fn();
vi.mock('../../lib/storage/prisma-journal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage/prisma-journal')>();
  return { ...actual, seedMigrationManifest: (...args: unknown[]) => mockSeedMigrationManifest(...args) };
});

vi.mock('../../lib/storage/cleanup-outbox', () => ({ processStorageCleanup: vi.fn() }));

import { inventory, inventoryLogicalKey, manifestSha256, pruneStaleMigrationEntries, renditionMime } from '../../scripts/storage-portability';

describe('storage portability CLI contracts', () => {
  it('maps legacy keys deterministically without mutating source identity', () => {
    const first = inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'original');
    expect(first).toMatch(/^legacy\/asset-1\/original-[a-f0-9]{24}$/);
    expect(inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'original')).toBe(first);
    expect(inventoryLogicalKey('asset-1', 'photos/été image.jpg', 'thumbnail')).not.toBe(first);
    expect(inventoryLogicalKey('asset-1', 'photos/valid.jpg', 'original')).toBe('photos/valid.jpg');
  });

  it('derives thumbnail MIME from bytes before source fallback', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(renditionMime('thumb.jpg', jpeg, 'video/mp4', 'video/mp4')).toBe('image/jpeg');
    expect(renditionMime('thumb.webp', Buffer.from('RIFFxxxxWEBP'), undefined)).toBe('image/webp');
  });

  it('binds manifest digest to exact serialized entries', () => {
    const entries = [{ logicalKey: 'a', sourceKey: 'b', size: 1, sha256: '0'.repeat(64) }, { logicalKey: 'c', sourceKey: 'd', size: 2, sha256: '1'.repeat(64) }];
    expect(manifestSha256(entries)).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestSha256([...entries].reverse())).not.toBe(manifestSha256(entries));
  });

  it('prunes only never-claimed migration entries orphaned relative to live assets, never in-flight or terminal rows', async () => {
    const executeRaw = vi.fn().mockResolvedValue(2);
    const db = { $executeRaw: executeRaw } as never;
    const deleted = await pruneStaleMigrationEntries(db);
    expect(deleted).toBe(2);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [query] = executeRaw.mock.calls[0]!;
    const sql = String(query.sql ?? query);
    // Scoped to never-claimed rows only — in-flight ('copying') and terminal
    // ('verified'/'rolled_back') work is never discarded.
    expect(sql).toContain("e.status = 'pending'");
    // Never touches an asset that has been soft-deleted; a live asset whose
    // keys simply weren't re-seeded yet must not look orphaned.
    expect(sql).toContain('a.deleted_at IS NULL');
    // Original and thumbnail renditions are matched against their own
    // current key columns, not each other's — this is the exact join that
    // must catch a thumbnail entry superseded by regenerate-thumbnails
    // rewriting thumbnail_storage_key/thumbnail_storage_source_key after
    // the entry was inventoried.
    expect(sql).toContain("e.rendition = 'original'");
    expect(sql).toContain('a.storage_source_key = e.source_key');
    expect(sql).toContain('a.storage_key = e.logical_key');
    expect(sql).toContain("e.rendition = 'thumbnail'");
    expect(sql).toContain('a.thumbnail_storage_source_key = e.source_key');
    expect(sql).toContain('a.thumbnail_storage_key = e.logical_key');
  });
});

describe('storage portability inventory cursor-resume safety', () => {
  const authorizedRole = [{ sessionUser: 'sploot_storage_operator', isSuperuser: false }];

  beforeEach(() => {
    vi.resetAllMocks();
    mockQueryRaw.mockResolvedValue(authorizedRole);
    mockAssetUpdate.mockResolvedValue({});
    mockInventoryStateUpsert.mockResolvedValue({});
    mockSeedMigrationManifest.mockResolvedValue(undefined);
    mockExecuteRaw.mockResolvedValue(0);
    mockMigrationEntryFindMany.mockResolvedValue([]);
    mockGetSourceKey.mockResolvedValue({ body: Buffer.from('legacy-bytes'), metadata: { contentType: 'image/png' } });
  });

  function asset(id: string, sourceKey: string) {
    return {
      id,
      storageKey: null,
      storageSourceKey: sourceKey,
      pathname: sourceKey,
      thumbnailStorageKey: null,
      thumbnailStorageSourceKey: null,
      thumbnailPath: null,
      thumbnailUrl: null,
      mime: 'image/png',
    };
  }

  it('prunes stale entries and emits the full durable manifest only after a fresh, cursor-less pass', async () => {
    mockAssetFindMany
      .mockResolvedValueOnce([asset('asset-1', 'uploads/a.png')])
      .mockResolvedValueOnce([]);

    await inventory(10);

    // A fresh (cursor-less) pass re-seeds every live asset from the start,
    // so it — and only it — is safe to prune from and treat as the
    // authoritative full manifest.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockMigrationEntryFindMany).toHaveBeenCalledTimes(1);
  });

  it('never prunes and never emits the full durable manifest when resuming from a cursor', async () => {
    mockAssetFindMany
      .mockResolvedValueOnce([asset('asset-2', 'uploads/b.png')])
      .mockResolvedValueOnce([]);

    await inventory(10, 'asset-1');

    // A cursor-resumed pass only re-seeds a SUFFIX of the live asset set —
    // it must never be trusted as complete. Pruning and the durable
    // full-manifest emission are gated on a subsequent fresh, cursor-less
    // pass; a resumed run just seeds and stops.
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockMigrationEntryFindMany).not.toHaveBeenCalled();
  });
});
