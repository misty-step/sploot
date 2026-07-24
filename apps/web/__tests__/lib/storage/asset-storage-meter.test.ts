import { describe, expect, it, vi } from 'vitest';
import { getPhysicalStorageUsage } from '@/lib/storage/asset-storage-meter';

describe('getPhysicalStorageUsage', () => {
  it('splits active vs trash bytes and returns their sum as the total', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ active_bytes: 1500n, trash_bytes: 400n }]);
    const tx = { $queryRaw: queryRaw } as never;

    const usage = await getPhysicalStorageUsage(tx, 'user-1');

    expect(usage).toEqual({ activeBytes: 1500n, trashBytes: 400n, totalBytes: 1900n });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('coerces numeric and string driver results to bigint', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ active_bytes: 250, trash_bytes: '75' }]);
    const tx = { $queryRaw: queryRaw } as never;

    const usage = await getPhysicalStorageUsage(tx, 'user-1');

    expect(usage).toEqual({ activeBytes: 250n, trashBytes: 75n, totalBytes: 325n });
  });

  it('defaults to zero bytes for a user with no assets at all', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ active_bytes: null, trash_bytes: null }]);
    const tx = { $queryRaw: queryRaw } as never;

    const usage = await getPhysicalStorageUsage(tx, 'user-1');

    expect(usage).toEqual({ activeBytes: 0n, trashBytes: 0n, totalBytes: 0n });
  });

  it('defaults to zero bytes when the driver returns no row at all', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const tx = { $queryRaw: queryRaw } as never;

    const usage = await getPhysicalStorageUsage(tx, 'user-1');

    expect(usage).toEqual({ activeBytes: 0n, trashBytes: 0n, totalBytes: 0n });
  });
});
