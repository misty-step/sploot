import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { del } from '@vercel/blob';
import { processStorageCleanup } from '@/lib/storage/cleanup-outbox';

vi.mock('@vercel/blob', () => ({ del: vi.fn(), put: vi.fn(), list: vi.fn() }));

function database(rows: Array<{ id: string; provider: string; key: string; url: string; attempts: number }>) {
  const tx = {
    $queryRawUnsafe: vi.fn().mockResolvedValue(rows),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  };
  return {
    tx,
    db: {
      $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)),
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    },
  };
}

describe('storage cleanup outbox', () => {
  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.STORAGE_S3_ENDPOINT = 'https://objects.example.test';
    process.env.S3_PUBLIC_URL_BASE = 'https://objects.example.test';
    process.env.STORAGE_S3_BUCKET = 'sploot';
    process.env.STORAGE_S3_ACCESS_KEY_ID = 'test-id';
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = 'test-secret';
    process.env.NEXT_PUBLIC_BLOB_BASE_URL = 'https://blob.example.test';
    vi.mocked(del).mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const name of ['STORAGE_PROVIDER', 'STORAGE_S3_ENDPOINT', 'S3_PUBLIC_URL_BASE', 'STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY_ID', 'STORAGE_S3_SECRET_ACCESS_KEY', 'NEXT_PUBLIC_BLOB_BASE_URL']) delete process.env[name];
  });

  it('cleans migrated legacy Vercel and active S3 rows under an S3 target', async () => {
    const { db, tx } = database([
      { id: 'legacy', provider: 'vercel', key: 'legacy/asset/original-deadbeef', url: 'https://blob.example.test/uploads/file%20name.png', attempts: 0 },
      { id: 'target', provider: 's3', key: 'assets/asset-1/original.png', url: 'https://objects.example.test/sploot/assets/asset-1/original.png', attempts: 0 },
    ]);
    const result = await processStorageCleanup(db as never, 10);
    expect(result).toMatchObject({ processed: 2, succeeded: 2, failed: 0, retrying: 0 });
    expect(del).toHaveBeenCalledWith('https://blob.example.test/uploads/file%20name.png');
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'DELETE' }));
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("status='processing'"), 'legacy', expect.any(String), expect.any(String), 300);
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("status='done'"), 'target', expect.any(String), expect.any(String));
  });

  it('records a transient failure and retries the row on the next scheduled run', async () => {
    const first = database([{ id: 'retry', provider: 'vercel', key: 'uploads/retry.png', url: 'https://blob.example.test/uploads/retry.png', attempts: 0 }]);
    vi.mocked(del).mockRejectedValueOnce(new Error('temporary provider outage'));
    const failed = await processStorageCleanup(first.db as never, 1);
    expect(failed).toMatchObject({ processed: 1, succeeded: 0, failed: 1, retrying: 1 });
    expect(first.db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("status='pending'"), 'retry', 'temporary provider outage', 60, expect.any(String), expect.any(String));

    const second = database([{ id: 'retry', provider: 'vercel', key: 'uploads/retry.png', url: 'https://blob.example.test/uploads/retry.png', attempts: 1 }]);
    const succeeded = await processStorageCleanup(second.db as never, 1);
    expect(succeeded).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(del).toHaveBeenLastCalledWith('https://blob.example.test/uploads/retry.png');
  });
});
