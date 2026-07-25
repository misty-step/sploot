import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();
const mockAssetFindMany = vi.fn();
const mockReplicaCreateMany = vi.fn();
const mockReplicaDeleteMany = vi.fn();
const mockReplicaFindMany = vi.fn();
const mockInventoryStateUpsert = vi.fn();

vi.mock('../../lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    asset: {
      findMany: (...args: unknown[]) => mockAssetFindMany(...args),
    },
    assetStorageReplica: {
      createMany: (...args: unknown[]) => mockReplicaCreateMany(...args),
      deleteMany: (...args: unknown[]) => mockReplicaDeleteMany(...args),
      findMany: (...args: unknown[]) => mockReplicaFindMany(...args),
    },
    storageInventoryState: { upsert: (...args: unknown[]) => mockInventoryStateUpsert(...args) },
  },
}));

const mockStoreGet = vi.fn();

import { backfill, reconcile, rollbackBackfill } from '../../scripts/storage-ledger';

const authorizedRole = [{ sessionUser: 'sploot_storage_operator', isSuperuser: false }];

describe('storage-ledger backfill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockQueryRaw.mockResolvedValue(authorizedRole);
    mockReplicaCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  });

  function legacyAsset(overrides: Record<string, unknown> = {}) {
    return {
      id: 'asset-1',
      blobUrl: 'https://blob.example.test/original.png',
      thumbnailUrl: null,
      pathname: 'uploads/original.png',
      thumbnailPath: null,
      storageProvider: 'vercel',
      storageKey: null,
      storageSourceKey: null,
      thumbnailStorageKey: null,
      thumbnailStorageSourceKey: null,
      storageSize: null,
      storageSha256: null,
      thumbnailStorageSize: null,
      thumbnailStorageSha256: null,
      mime: 'image/png',
      size: 1234,
      checksumSha256: 'c'.repeat(64),
      ...overrides,
    };
  }

  it('materializes an original replica from Asset.size/checksumSha256 when no physical columns were ever recorded', async () => {
    mockAssetFindMany.mockResolvedValueOnce([legacyAsset()]).mockResolvedValueOnce([]);

    const outcome = await backfill(10, undefined);

    expect(outcome.created).toBe(1);
    expect(outcome.backfilledAssetIds).toEqual(['asset-1']);
    expect(mockReplicaCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        assetId: 'asset-1',
        rendition: 'original',
        provider: 'vercel',
        size: 1234,
        sha256: 'c'.repeat(64),
        generation: 0,
        active: true,
      })],
      skipDuplicates: true,
    });
  });

  it('prefers the verified storageSize/storageSha256 physical columns over the pre-processing Asset.size/checksum', async () => {
    mockAssetFindMany.mockResolvedValueOnce([legacyAsset({ storageSize: 999, storageSha256: 'd'.repeat(64) })]).mockResolvedValueOnce([]);

    await backfill(10, undefined);

    expect(mockReplicaCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ size: 999, sha256: 'd'.repeat(64) })],
      skipDuplicates: true,
    });
  });

  it('backfills the thumbnail rendition only when its physical size and hash were both already verified', async () => {
    mockAssetFindMany.mockResolvedValueOnce([legacyAsset({
      thumbnailUrl: 'https://blob.example.test/thumb.png',
      thumbnailPath: 'uploads/thumb.png',
      thumbnailStorageSize: 200,
      thumbnailStorageSha256: 'e'.repeat(64),
    })]).mockResolvedValueOnce([]);

    const outcome = await backfill(10, undefined);

    expect(outcome.skipped).toBe(0);
    const [[{ data }]] = mockReplicaCreateMany.mock.calls;
    expect(data).toHaveLength(2);
    expect(data[1]).toEqual(expect.objectContaining({ rendition: 'thumbnail', size: 200, sha256: 'e'.repeat(64) }));
  });

  it('skips the thumbnail rendition (never fabricates a hash) when its physical size or hash is unverified', async () => {
    mockAssetFindMany.mockResolvedValueOnce([legacyAsset({
      thumbnailUrl: 'https://blob.example.test/thumb.png',
      thumbnailPath: 'uploads/thumb.png',
      // thumbnailStorageSha256 stays null: unverified.
    })]).mockResolvedValueOnce([]);

    const outcome = await backfill(10, undefined);

    expect(outcome.skipped).toBe(1);
    const [[{ data }]] = mockReplicaCreateMany.mock.calls;
    expect(data).toHaveLength(1);
    expect(data[0].rendition).toBe('original');
  });

  it('only targets assets with zero existing replica rows, and paginates by cursor', async () => {
    mockAssetFindMany.mockResolvedValueOnce([legacyAsset({ id: 'asset-2' })]).mockResolvedValueOnce([]);

    await backfill(1, 'asset-1');

    expect(mockAssetFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storageReplicas: { none: {} }, id: { gt: 'asset-1' } },
    }));
  });

  it('rejects an unauthorized database role before touching any asset', async () => {
    mockQueryRaw.mockResolvedValue([{ sessionUser: 'app_runtime', isSuperuser: false }]);

    await expect(backfill(10, undefined)).rejects.toThrow(/operator authority/);
    expect(mockAssetFindMany).not.toHaveBeenCalled();
  });

  it('rollback deletes exactly the generation-0 rows recorded in the receipt, scoped to those asset ids', async () => {
    mockReplicaDeleteMany.mockResolvedValue({ count: 2 });

    const deleted = await rollbackBackfill({
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      backfilledAssetIds: ['asset-1', 'asset-2'],
    });

    expect(deleted).toBe(2);
    expect(mockReplicaDeleteMany).toHaveBeenCalledWith({
      where: { assetId: { in: ['asset-1', 'asset-2'] }, generation: 0 },
    });
  });

  it('rollback is a no-op for an empty receipt', async () => {
    const deleted = await rollbackBackfill({ startedAt: '', completedAt: '', backfilledAssetIds: [] });
    expect(deleted).toBe(0);
    expect(mockReplicaDeleteMany).not.toHaveBeenCalled();
  });
});

describe('storage-ledger reconcile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockQueryRaw.mockResolvedValue(authorizedRole);
    mockExecuteRaw.mockResolvedValue(0);
    mockInventoryStateUpsert.mockResolvedValue({});
  });

  const bodyBytes = Buffer.from('abcd');
  const bodySha256 = createHash('sha256').update(bodyBytes).digest('hex');

  function replicaRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'replica-1',
      assetId: 'asset-1',
      provider: 'vercel',
      logicalKey: 'uploads/original.png',
      size: bodyBytes.byteLength,
      sha256: bodySha256,
      ...overrides,
    };
  }

  it('marks a replica ok when the provider object matches size and sha256 exactly', async () => {
    mockReplicaFindMany.mockResolvedValueOnce([replicaRow()]);
    mockStoreGet.mockResolvedValue({ body: bodyBytes, metadata: { size: bodyBytes.byteLength } });

    const summary = await reconcile(10, undefined, undefined, () => ({
      provider: 'vercel',
      get: mockStoreGet,
    } as never));

    expect(summary).toMatchObject({ scanned: 1, ok: 1, mismatched: 0, missing: 0 });
    expect(mockInventoryStateUpsert).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('classifies a size/sha256 mismatch and records a durable ledger-mismatch failure', async () => {
    mockReplicaFindMany.mockResolvedValueOnce([replicaRow({ size: 999 })]);
    mockStoreGet.mockResolvedValue({ body: bodyBytes, metadata: { size: bodyBytes.byteLength } });

    const summary = await reconcile(10, undefined, undefined, () => ({
      provider: 'vercel',
      get: mockStoreGet,
    } as never));

    expect(summary.mismatched).toBe(1);
    expect(summary.ok).toBe(0);
    const [sql] = mockExecuteRaw.mock.calls[0]!;
    expect(String(sql.sql ?? sql)).toContain('storage_inventory_failures');
  });

  it('classifies a missing provider object and records a durable ledger-missing failure without throwing', async () => {
    const { ObjectNotFoundError } = await import('../../lib/storage/object-store');
    mockReplicaFindMany.mockResolvedValueOnce([replicaRow()]);
    mockStoreGet.mockRejectedValue(new ObjectNotFoundError('uploads/original.png'));

    const summary = await reconcile(10, undefined, undefined, () => ({
      provider: 'vercel',
      get: mockStoreGet,
    } as never));

    expect(summary.missing).toBe(1);
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it('classifies an unsupported/unconfigured provider without crashing the whole page', async () => {
    mockReplicaFindMany.mockResolvedValueOnce([replicaRow({ provider: 's3' })]);

    const summary = await reconcile(10, undefined, undefined, () => {
      throw new Error('No object store configured for provider "s3"');
    });

    expect(summary.unsupportedProvider).toBe(1);
    expect(mockStoreGet).not.toHaveBeenCalled();
  });

  it('advances the durable cursor per row so a resumed page never re-scans an already-confirmed row', async () => {
    mockReplicaFindMany.mockResolvedValueOnce([replicaRow({ id: 'replica-5' })]);
    mockStoreGet.mockResolvedValue({ body: bodyBytes, metadata: { size: bodyBytes.byteLength } });

    await reconcile(10, 'replica-4', undefined, () => ({ provider: 'vercel', get: mockStoreGet } as never));

    expect(mockReplicaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, id: { gt: 'replica-4' } },
    }));
    expect(mockInventoryStateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'storage-ledger' },
      update: expect.objectContaining({ cursor: 'replica-5' }),
    }));
  });
});
