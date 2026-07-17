import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { processStorageCleanup } from '@/lib/storage/cleanup-outbox';

const deleteBlob = vi.hoisted(() => vi.fn());
vi.mock('@vercel/blob', () => ({ del: deleteBlob, put: vi.fn(), list: vi.fn() }));

const hasAuthorityDatabase = Boolean(process.env.DATABASE_URL && process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL);
const describeWithDatabase = hasAuthorityDatabase ? describe.sequential : describe.skip;

describeWithDatabase('storage cleanup PostgreSQL leases', () => {
  let admin: PrismaClient;
  beforeAll(() => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL! } } });
  });
  afterAll(async () => { await admin.$disconnect(); });
  const outboxId = 'storage-cleanup-stale-worker-row';

  beforeEach(() => {
    vi.stubEnv('STORAGE_PROVIDER', 'vercel');
    vi.stubEnv('NEXT_PUBLIC_BLOB_BASE_URL', 'https://source.public.blob.vercel-storage.com');
    deleteBlob.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await admin.storageCleanupOutbox.deleteMany({ where: { id: outboxId } });
  });

  it('lets a successor reclaim an expired claim while stale finalization is fenced', async () => {
    let releaseFirst!: () => void;
    const firstDelete = new Promise<void>(resolve => { releaseFirst = resolve; });
    deleteBlob.mockImplementationOnce(() => firstDelete).mockResolvedValue(undefined);
    await admin.storageCleanupOutbox.create({ data: {
      id: outboxId,
      provider: 'vercel',
      key: 'uploads/stale.png',
      url: 'https://source.public.blob.vercel-storage.com/uploads/stale.png',
      action: 'permanent-delete',
      status: 'pending',
      availableAt: new Date(),
    } });

    const first = processStorageCleanup(admin, 1, { workerId: 'worker-a', leaseSeconds: 1 });
    await vi.waitFor(() => expect(deleteBlob).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 1_100));
    const successor = await processStorageCleanup(admin, 1, { workerId: 'worker-b', leaseSeconds: 30 });
    releaseFirst();
    const stale = await first;

    expect(successor).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(stale).toMatchObject({ processed: 1, succeeded: 0, failed: 1 });
    expect(await admin.storageCleanupOutbox.findUnique({ where: { id: outboxId }, select: { status: true, claimOwner: true, claimToken: true } })).toEqual({ status: 'done', claimOwner: null, claimToken: null });
  }, 15_000);
});
