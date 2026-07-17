import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = { $transaction: vi.fn() };
const mockDeleteReplica = vi.fn();
const mockQuery = vi.fn();
const mockInvalidateExports = vi.fn();
const mockTx = {
  asset: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  assetTag: { deleteMany: vi.fn() },
  assetEmbedding: { deleteMany: vi.fn() },
  libraryExport: { updateMany: mockInvalidateExports },
  $queryRawUnsafe: mockQuery,
  $executeRawUnsafe: vi.fn(),
};
vi.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));
vi.mock('@/lib/db', () => ({ get prisma() { return mockPrisma; } }));
vi.mock('@/lib/auth/with-authenticated-api', () => ({ withAuthenticatedApi: (handler: (request: unknown, context: unknown, auth: unknown) => unknown) => (request: unknown, context: unknown) => handler(request, context, { principal: { userId: 'user-1' } }) }));
vi.mock('@/lib/with-observability', () => ({ withObservability: (handler: unknown) => handler }));
vi.mock('@/lib/storage/object-store', () => ({ ConfiguredStorageWriter: class { strict = true; put = vi.fn(); deleteUrl = vi.fn(); deleteReplica = mockDeleteReplica; } }));
vi.mock('@/lib/cache', () => ({ getCacheService: () => ({ clear: vi.fn() }) }));
vi.mock('@/lib/slug-cache', () => ({ invalidateSlugCache: vi.fn() }));
vi.mock('@/lib/enrollment/enrollment-policy', () => ({ acquireEnrollmentIdentityWriterLock: vi.fn(), enrollmentResponseForError: vi.fn(), enrollmentUnavailableResponse: vi.fn() }));

import { DELETE } from '@/app/api/assets/[id]/route';

describe('permanent asset deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.asset.findFirst.mockResolvedValueOnce({ id: 'asset-1', ownerUserId: 'user-1', shareSlug: 'share-1', storageProvider: 's3', storageKey: 'assets/asset-1/original.png', storageSourceKey: 'legacy source', pathname: 'original.png', blobUrl: 'https://objects.example.test/sploot/assets/asset-1/original.png', thumbnailUrl: null, thumbnailStorageKey: null, thumbnailStorageSourceKey: null, thumbnailPath: null });
    mockTx.asset.findFirst.mockResolvedValueOnce({ id: 'asset-1', ownerUserId: 'user-1', deletedAt: new Date() });
    mockQuery.mockResolvedValue([
      { provider: 'vercel', source_key: 'uploads/file%20name.png', logical_key: 'legacy/asset/original-deadbeef', delivery_url: 'https://blob.example.test/uploads/file%20name.png', active: false },
      { provider: 's3', source_key: 'uploads/file%20name.png', logical_key: 'assets/asset-1/original.png', delivery_url: 'https://objects.example.test/sploot/assets/asset-1/original.png', active: true },
    ]);
    mockPrisma.$transaction.mockImplementation(async (fn: (value: typeof mockTx) => unknown) => fn(mockTx));
    mockDeleteReplica.mockResolvedValue(undefined);
  });

  it('enqueues and deletes inactive legacy plus active target replicas', async () => {
    const request = new NextRequest('https://sploot.example.test/api/assets/asset-1?permanent=true', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });
    expect(response.status).toBe(200);
    expect(mockDeleteReplica).toHaveBeenCalledTimes(2);
    expect(mockDeleteReplica).toHaveBeenCalledWith({ provider: 'vercel', key: 'uploads/file%20name.png', url: 'https://blob.example.test/uploads/file%20name.png' });
    expect(mockDeleteReplica).toHaveBeenCalledWith({ provider: 's3', key: 'assets/asset-1/original.png', url: 'https://objects.example.test/sploot/assets/asset-1/original.png' });
    const query = String(mockQuery.mock.calls[0]?.[0]);
    expect(query).toContain('source_key');
    expect(query).not.toContain('active=true');
  });

  it('fences deletion of a replica still referenced by another live asset', async () => {
    mockQuery.mockImplementation(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('AS shared')) {
        const provider = args[1];
        // Only the legacy vercel replica is shared with a sibling live asset.
        return [{ shared: provider === 'vercel' }];
      }
      return [
        { provider: 'vercel', source_key: 'uploads/shared.png', logical_key: 'legacy/asset/shared-deadbeef', delivery_url: 'https://blob.example.test/uploads/shared.png', active: false },
        { provider: 's3', source_key: 'uploads/shared.png', logical_key: 'assets/asset-1/original.png', delivery_url: 'https://objects.example.test/sploot/assets/asset-1/original.png', active: true },
      ];
    });

    const request = new NextRequest('https://sploot.example.test/api/assets/asset-1?permanent=true', { method: 'DELETE' });
    const response = await DELETE(request, { params: Promise.resolve({ id: 'asset-1' }) });

    expect(response.status).toBe(200);
    // Only the unshared s3 replica is physically deleted; the vercel replica
    // is fenced because a sibling live asset still references the same
    // physical object (dedup/cutover multi-asset scenario).
    expect(mockDeleteReplica).toHaveBeenCalledTimes(1);
    expect(mockDeleteReplica).toHaveBeenCalledWith({ provider: 's3', key: 'assets/asset-1/original.png', url: 'https://objects.example.test/sploot/assets/asset-1/original.png' });
    expect(mockDeleteReplica).not.toHaveBeenCalledWith(expect.objectContaining({ provider: 'vercel' }));
    // No outbox row was queued for the fenced replica either — only the
    // single unshared s3 replica gets an INSERT (the row this asserts on);
    // the same mock also records the later markReplicaCleanupDone UPDATE
    // for that one replica, which also mentions storage_cleanup_outbox, so
    // this filters specifically to the enqueue INSERT.
    const outboxInserts = (mockTx.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls.filter((call) => String(call[0]).startsWith('INSERT INTO storage_cleanup_outbox'));
    expect(outboxInserts).toHaveLength(1);
    expect(outboxInserts[0]).toContain('s3');
    expect(outboxInserts[0]).not.toContain('vercel');
  });
});
