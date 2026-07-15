import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

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

import {
  cleanupExpiredUploadReceipts,
  UploadIdempotencyInProgressError,
  UploadIdempotencyLeaseLostError,
  runIdempotentUpload,
} from '@/lib/upload/upload-idempotency';

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
}

describe('runIdempotentUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.uploadIdempotency.deleteMany.mockResolvedValue({ count: 0 });
  });

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

    mocks.prisma.uploadIdempotency.create.mockRejectedValueOnce(uniqueViolation());
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
    mocks.prisma.uploadIdempotency.create.mockRejectedValue(uniqueViolation());
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

  it('does not report success after losing the completion lease', async () => {
    mocks.prisma.uploadIdempotency.create.mockResolvedValue({ id: 'receipt-1' });
    mocks.prisma.uploadIdempotency.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.uploadIdempotency.findUnique.mockResolvedValue({
      id: 'receipt-1',
      status: 'processing',
      result: null,
    });

    await expect(runIdempotentUpload('user-1', 'queue-lost', vi.fn().mockResolvedValue({ kind: 'created' })))
      .rejects.toBeInstanceOf(UploadIdempotencyLeaseLostError);
  });

  it('cleans retained receipts and only stale processing rows past the state-fenced TTL', async () => {
    mocks.prisma.uploadIdempotency.deleteMany.mockResolvedValue({ count: 2 });

    await expect(cleanupExpiredUploadReceipts(new Date('2026-07-15T00:00:00.000Z'))).resolves.toBe(2);
    expect(mocks.prisma.uploadIdempotency.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: 'completed', retainedUntil: { lt: new Date('2026-07-15T00:00:00.000Z') } },
          {
            status: 'processing',
            leaseExpiresAt: { lt: new Date('2026-07-14T23:50:00.000Z') },
            updatedAt: { lt: new Date('2026-07-14T23:50:00.000Z') },
          },
        ],
      },
    });
  });
});
