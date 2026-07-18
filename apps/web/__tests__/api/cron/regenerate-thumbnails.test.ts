import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { GET } from '@/app/api/cron/regenerate-thumbnails/route';
import { NextRequest } from 'next/server';

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// Spy on the observability logger's logError to observe structured error
// signals, while keeping every other export (including withTraceId, used by
// withObservability) real.
const mockLogError = vi.fn();
vi.mock('@/lib/observability-logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability-logger')>();
  return {
    ...actual,
    logger: {
      logInfo: actual.logger.logInfo.bind(actual.logger),
      logError: (...args: unknown[]) => mockLogError(...args),
      logTiming: actual.logger.logTiming.bind(actual.logger),
      getTraceId: actual.logger.getTraceId.bind(actual.logger),
    },
  };
});

// Mock lib/db
const mockTx = {
  asset: { update: vi.fn() },
  assetStorageReplica: { createMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
};
const mockPrisma = {
  asset: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  $executeRawUnsafe: vi.fn(),
};

let mockDatabaseAvailable = true;

vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockDatabaseAvailable ? mockPrisma : null;
  },
  get databaseAvailable() {
    return mockDatabaseAvailable;
  },
}));

// Mock @vercel/blob — uploads must not hit the network
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock('@vercel/blob', () => ({
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

global.fetch = vi.fn();

interface FetchMock {
  mockResolvedValueOnce(value: unknown): FetchMock;
}

const fetchMock = global.fetch as unknown as FetchMock;

function makeRequest(query = '') {
  return new NextRequest(`http://localhost/api/cron/regenerate-thumbnails${query}`);
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 200 } },
  })
    .png()
    .toBuffer();
}

function fetchResponse(buffer: Buffer) {
  return new Response(buffer, { status: 200, headers: { 'content-length': String(buffer.byteLength) } });
}

describe('/api/cron/regenerate-thumbnails', () => {
  const CRON_SECRET = 'test-cron-secret';

  const baseAsset = {
    id: 'asset-1',
    blobUrl: 'https://blob.example/original.png',
    thumbnailUrl: 'https://blob.example/original-thumb.png',
    pathname: 'user/original.png',
    storageKey: null,
    thumbnailStorageKey: null,
    thumbnailPath: 'user/original-thumb.png',
    mime: 'image/png',
    width: 800,
    height: 1000,
  };

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.NEXT_PUBLIC_BLOB_BASE_URL = 'https://blob.example';
    mockDatabaseAvailable = true;
    vi.clearAllMocks();
    mockHeaders.mockReturnValue({
      get: vi.fn((key: string) =>
        key === 'authorization' ? `Bearer ${CRON_SECRET}` : null
      ),
    });
    mockPut.mockResolvedValue({
      url: 'https://blob.example/original-thumb-new.png',
      pathname: 'user/original-thumb-new.png',
    });
    mockDel.mockResolvedValue(undefined);
    mockPrisma.asset.update.mockResolvedValue({});
    mockTx.asset.update.mockResolvedValue({});
    mockTx.assetStorageReplica.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    // Not shared by default: the old-thumbnail/orphaned-replica
    // shared-reference fence check (hasLiveSharedReference) resolves false
    // unless a test explicitly overrides it.
    mockTx.$queryRawUnsafe.mockResolvedValue([{ shared: false }]);
    mockTx.$executeRawUnsafe.mockResolvedValue(1);
  });

  it('rejects requests without the cron secret', async () => {
    mockHeaders.mockReturnValue({ get: vi.fn(() => null) });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('regenerates a legacy square-cropped thumbnail from the original', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256); // the pre-fix crop
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.regenerated).toBe(1);
    expect(body.failed).toBe(0);

    // the uploaded replacement preserves the original's aspect
    const uploadedBuffer = mockPut.mock.calls[0][1] as Buffer;
    const meta = await sharp(uploadedBuffer).metadata();
    expect(Math.abs(meta.width! / meta.height! - 800 / 1000)).toBeLessThan(0.02);

    expect(mockTx.asset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        thumbnailUrl: 'https://blob.example/original-thumb-new.png',
        thumbnailPath: expect.any(String),
        thumbnailStorageKey: expect.any(String),
        thumbnailStorageSize: expect.any(Number),
        thumbnailStorageSha256: expect.any(String),
        storageConfigFingerprint: expect.any(String),
      }),
    }));

    // The new thumbnail object is recorded in the replica ledger in the same
    // transaction, or a later permanent delete would never enqueue it for
    // provider cleanup (it would have no row at all once any row exists for
    // this asset — see permanent-delete.ts's authoritative-rows comment).
    expect(mockTx.assetStorageReplica.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          assetId: 'asset-1',
          rendition: 'thumbnail',
          logicalKey: 'user/original-thumb-new.png',
          deliveryUrl: 'https://blob.example/original-thumb-new.png',
          active: true,
        }),
      ]),
    }));

    expect(mockDel).toHaveBeenCalledWith('https://blob.example/original-thumb.png');
  });

  it('regenerates when the stored thumbnail has disappeared', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(fetchResponse(original));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.regenerated).toBe(1);
    expect(body.failed).toBe(0);
    expect(mockTx.asset.update).toHaveBeenCalledTimes(1);
  });

  it('skips thumbnails whose aspect already matches the original', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const correctThumb = await png(205, 256); // 800/1000 aspect at 256 edge
    fetchMock.mockResolvedValueOnce(fetchResponse(correctThumb));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.alreadyCorrect).toBe(1);
    expect(body.regenerated).toBe(0);
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  it('reports failures without aborting the batch and pages via cursor', async () => {
    const second = { ...baseAsset, id: 'asset-2' };
    const third = { ...baseAsset, id: 'asset-3' };
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset, second, third]);
    const correctThumb = await png(205, 256);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 404 }) // asset-1 thumb gone
      .mockResolvedValueOnce(new Response(null, { status: 503 })) // asset-1 original unavailable
      .mockResolvedValueOnce(fetchResponse(correctThumb)); // asset-2 fine

    const res = await GET(makeRequest('?limit=2'));
    const body = await res.json();

    expect(body.scanned).toBe(2);
    expect(body.failed).toBe(1);
    expect(body.failures[0].id).toBe('asset-1');
    expect(body.alreadyCorrect).toBe(1);
    expect(body.nextCursor).toBe('asset-2'); // third candidate signals more work
  });

  it('prefers the raw legacy source key over the inventoried logical key when enqueuing an old-thumbnail cleanup', async () => {
    const inventoriedAsset = {
      ...baseAsset,
      storageProvider: 'vercel',
      thumbnailStorageSourceKey: 'user/raw-legacy-thumb.png',
      thumbnailStorageKey: 'legacy/asset-1/thumbnail-deadbeef',
    };
    mockPrisma.asset.findMany.mockResolvedValue([inventoriedAsset]);
    const legacySquareThumb = await png(256, 256);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));
    mockDel.mockRejectedValueOnce(new Error('provider outage'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.failed).toBe(1);
    // The replica ledger write and asset update still committed before the
    // best-effort old-object delete failed, so the new thumbnail is not lost.
    expect(mockTx.assetStorageReplica.createMany).toHaveBeenCalledTimes(1);
    // Durably enqueued (fenced, not shared) through the shared outbox seam
    // BEFORE the best-effort delete was attempted — using the raw legacy
    // source key, not the inventoried logical key.
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'asset-1',
      'vercel',
      'user/raw-legacy-thumb.png',
      'https://blob.example/original-thumb.png',
      'delete-thumbnail',
    );
  });

  it('does not physically delete an old thumbnail still shared by another live asset, and does not enqueue it either', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));
    // A second live asset still references this exact legacy thumbnail
    // URL/key (dedup/cutover multi-asset scenario) — the shared-reference
    // fence must refuse both the enqueue and the physical delete.
    mockTx.$queryRawUnsafe.mockResolvedValue([{ shared: true }]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.regenerated).toBe(1);
    expect(body.failed).toBe(0);
    // The new thumbnail still commits normally.
    expect(mockTx.assetStorageReplica.createMany).toHaveBeenCalledTimes(1);
    // Deterministic proof of the fence: the old shared thumbnail is never
    // physically deleted...
    expect(mockDel).not.toHaveBeenCalledWith('https://blob.example/original-thumb.png');
    // ...and never durably enqueued for cleanup either, since it is still
    // legitimately referenced by the sibling asset.
    const oldThumbInserts = (mockTx.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO storage_cleanup_outbox') && call[4] === 'delete-thumbnail',
    );
    expect(oldThumbInserts).toHaveLength(0);
  });

  it('preserves the original transaction error and durably enqueues the orphaned replica when cleanup-after-failure also fails', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));
    mockTx.assetStorageReplica.createMany.mockRejectedValueOnce(new Error('permission denied'));
    // The cleanup attempt for the just-uploaded orphan ALSO fails (e.g. a
    // provider outage right after the ledger write failed).
    mockDel.mockRejectedValueOnce(new Error('cleanup provider outage'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failed).toBe(1);
    // The ORIGINAL transaction error must survive — never replaced by the
    // cleanup failure that happened while handling it.
    expect(body.failures[0].reason).toBe('permission denied');
    expect(body.failures[0].reason).not.toContain('cleanup provider outage');
    // The orphaned new replica that could not be deleted must be durably
    // enqueued through the same shared-reference-aware outbox seam
    // old-thumbnail cleanup uses — never silently dropped as a
    // best-effort-only leak.
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.any(String),
      'asset-1',
      'vercel',
      'user/original-thumb-new.png',
      'https://blob.example/original-thumb-new.png',
      'delete-thumbnail',
    );
    // Cleanup succeeded via the durable outbox insert, so no double-failure
    // signal was needed.
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('emits an explicit structured signal (never masking the original error, never logging the delivery URL) when cleanup AND the durable outbox insert both fail', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));
    mockTx.assetStorageReplica.createMany.mockRejectedValueOnce(new Error('permission denied'));
    // Both the provider cleanup AND the durable outbox insert fail: the
    // just-uploaded replica is now leaked with no retry path recorded
    // anywhere unless an explicit signal is emitted.
    mockDel.mockRejectedValueOnce(new Error('cleanup provider outage'));
    mockTx.$executeRawUnsafe.mockRejectedValueOnce(new Error('outbox insert failed'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failed).toBe(1);
    // The original transaction failure is still what surfaces to the caller.
    expect(body.failures[0].reason).toBe('permission denied');
    expect(body.failures[0].reason).not.toContain('outbox insert failed');
    // An explicit structured signal was emitted through the shared
    // logger/Canary convention for the now-unrecorded leak.
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const [context, error, metadata] = mockLogError.mock.calls[0];
    expect(context).toBe('storage.regenerate-thumbnails.orphaned-replica-leak');
    expect((error as Error).message).toBe('outbox insert failed');
    expect(metadata).toMatchObject({
      assetId: 'asset-1',
      provider: 'vercel',
      key: 'user/original-thumb-new.png',
      cleanupError: 'cleanup provider outage',
      originalError: 'permission denied',
    });
    // Never log the delivery URL alongside the leak signal.
    expect(JSON.stringify(metadata)).not.toContain('https://blob.example/original-thumb-new.png');
  });

  it('rolls back the asset update when the replica ledger write fails, and cleans up the newly uploaded object', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([baseAsset]);
    const legacySquareThumb = await png(256, 256);
    const original = await png(800, 1000);
    fetchMock
      .mockResolvedValueOnce(fetchResponse(legacySquareThumb))
      .mockResolvedValueOnce(fetchResponse(original));
    mockTx.assetStorageReplica.createMany.mockRejectedValueOnce(new Error('permission denied'));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.failed).toBe(1);
    expect(body.failures[0].reason).toContain('permission denied');
    // Cleanup deletes the just-uploaded object since the transaction rolled back.
    expect(mockDel).toHaveBeenCalledWith('https://blob.example/original-thumb-new.png');
    // The stale-crop thumbnail was never touched since the write never committed.
    expect(mockDel).not.toHaveBeenCalledWith('https://blob.example/original-thumb.png');
  });
});
