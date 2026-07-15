import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    uploadIdempotency: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

import { UploadIdempotencyInProgressError, runIdempotentUpload } from '@/lib/upload/upload-idempotency';

describe('runIdempotentUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores and returns the first result without re-executing the vendor pipeline', async () => {
    mocks.prisma.uploadIdempotency.create.mockResolvedValue({ id: 'receipt-1' });
    mocks.prisma.uploadIdempotency.updateMany.mockResolvedValue({ count: 1 });
    const execute = vi.fn().mockResolvedValue({ assetId: 'asset-1' });

    await expect(runIdempotentUpload('user-1', 'queue-1', execute)).resolves.toEqual({ assetId: 'asset-1' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.uploadIdempotency.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'receipt-1', status: 'processing' }),
      data: expect.objectContaining({ status: 'completed', result: { assetId: 'asset-1' } }),
    }));

    mocks.prisma.uploadIdempotency.create.mockRejectedValueOnce(new Error('Unique constraint failed'));
    mocks.prisma.uploadIdempotency.findUnique.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'completed',
      result: { assetId: 'asset-1' },
    });
    const replay = vi.fn();
    await expect(runIdempotentUpload('user-1', 'queue-1', replay)).resolves.toEqual({ assetId: 'asset-1' });
    expect(replay).not.toHaveBeenCalled();
  });

  it('reclaims only an expired receipt and rejects a live concurrent receipt', async () => {
    mocks.prisma.uploadIdempotency.create.mockRejectedValue(new Error('Unique constraint failed'));
    mocks.prisma.uploadIdempotency.findUnique.mockResolvedValue({
      id: 'receipt-1',
      status: 'processing',
      leaseExpiresAt: new Date(0),
    });
    mocks.prisma.uploadIdempotency.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    await expect(runIdempotentUpload('user-1', 'queue-1', vi.fn().mockResolvedValue('recovered'))).resolves.toBe('recovered');

    mocks.prisma.uploadIdempotency.updateMany.mockReset().mockResolvedValue({ count: 0 });
    await expect(runIdempotentUpload('user-1', 'queue-1', vi.fn())).rejects.toBeInstanceOf(UploadIdempotencyInProgressError);
  });
});
