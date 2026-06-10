import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    userStorageQuota: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    storageQuotaReservation: {
      aggregate: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    asset: {
      aggregate: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
    storageQuotaReservation: {
      deleteMany: vi.fn(),
    },
  };

  return { prisma, tx };
});

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

import {
  checkUploadBytesAllowed,
  reserveUploadBytes,
  releaseStorageQuotaReservation,
  StorageQuotaExceededError,
  getStorageQuotaSnapshot,
} from '@/lib/quota/storage-quota-policy';

describe('storage quota policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.userStorageQuota.upsert.mockResolvedValue({});
    mocks.tx.userStorageQuota.findUniqueOrThrow.mockResolvedValue({ limitBytes: 1000n });
    mocks.tx.asset.aggregate.mockResolvedValue({ _sum: { size: 400 } });
    mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 100n } });
    mocks.tx.storageQuotaReservation.create.mockResolvedValue({ id: 'reservation-1' });
  });

  it('reserves upload bytes when the request fits under the limit', async () => {
    await expect(reserveUploadBytes('user-1', 500)).resolves.toEqual({
      id: 'reservation-1',
      snapshot: {
        usedBytes: 400,
        limitBytes: 1000,
        remainingBytes: 0,
        reservedBytes: 100,
        incomingBytes: 500,
      },
    });

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.storageQuotaReservation.deleteMany).toHaveBeenCalledWith({
      where: {
        ownerUserId: 'user-1',
        expiresAt: { lte: expect.any(Date) },
      },
    });
    expect(mocks.tx.storageQuotaReservation.create).toHaveBeenCalledWith({
      data: {
        ownerUserId: 'user-1',
        bytes: 500n,
        expiresAt: expect.any(Date),
      },
      select: { id: true },
    });
  });

  it('rejects over-quota uploads before creating a reservation', async () => {
    await expect(reserveUploadBytes('user-1', 501)).rejects.toBeInstanceOf(StorageQuotaExceededError);
    expect(mocks.tx.storageQuotaReservation.create).not.toHaveBeenCalled();
  });

  it('checks upload bytes without creating a reservation', async () => {
    await expect(checkUploadBytesAllowed('user-1', 500)).resolves.toMatchObject({
      usedBytes: 400,
      limitBytes: 1000,
      incomingBytes: 500,
    });

    expect(mocks.tx.storageQuotaReservation.create).not.toHaveBeenCalled();
  });

  it('releases reservations idempotently', async () => {
    await releaseStorageQuotaReservation('reservation-1');
    expect(mocks.prisma.storageQuotaReservation.deleteMany).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
    });
  });
  it('retries when Prisma throws a serialization P2034 error', async () => {
    // Import Prisma so we can mock our known client error
    const { Prisma: ClientPrisma } = await import('@prisma/client');
    const p2034Error = new ClientPrisma.PrismaClientKnownRequestError(
      'Transaction failed due to a write conflict or a deadlock',
      { code: 'P2034', clientVersion: '5.0.0' }
    );
    // Mock $transaction to fail once with P2034 and succeed on the next attempt
    mocks.prisma.$transaction
      .mockRejectedValueOnce(p2034Error)
      .mockImplementationOnce((callback) => callback(mocks.tx));
    await expect(getStorageQuotaSnapshot('user-1')).resolves.toEqual({
      usedBytes: 400,
      limitBytes: 1000,
      remainingBytes: 500,
      reservedBytes: 100,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries when PostgreSQL reports a raw serialization failure code', async () => {
    const serializationError = Object.assign(new Error('serialization failure'), { code: '40001' });
    mocks.prisma.$transaction
      .mockRejectedValueOnce(serializationError)
      .mockImplementationOnce((callback) => callback(mocks.tx));

    await expect(getStorageQuotaSnapshot('user-1')).resolves.toEqual({
      usedBytes: 400,
      limitBytes: 1000,
      remainingBytes: 500,
      reservedBytes: 100,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('degrades to the default snapshot when the users row is missing (quota FK violation)', async () => {
    const { Prisma } = await import('@prisma/client');
    const fkViolation = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint violated: user_storage_quotas_user_id_fkey',
      { code: 'P2003', clientVersion: 'test' }
    );
    mocks.tx.userStorageQuota.upsert.mockRejectedValue(fkViolation);

    await expect(getStorageQuotaSnapshot('user-without-row')).resolves.toEqual({
      usedBytes: 0,
      limitBytes: 1024 * 1024 * 1024,
      remainingBytes: 1024 * 1024 * 1024,
      reservedBytes: 0,
    });
  });
});
