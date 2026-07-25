import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    user: {
      findUnique: vi.fn(),
    },
    userStorageQuota: {
      upsert: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    storageQuotaReservation: {
      aggregate: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
  };

  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
    storageQuotaReservation: {
      deleteMany: vi.fn(),
    },
  };

  const getPhysicalStorageUsage = vi.fn();

  return { prisma, tx, getPhysicalStorageUsage };
});

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@/lib/storage/asset-storage-meter', () => ({
  getPhysicalStorageUsage: mocks.getPhysicalStorageUsage,
}));

import {
  checkUploadBytesAllowed,
  commitUploadBytes,
  reserveUploadBytes,
  releaseStorageQuotaReservation,
  StorageQuotaExceededError,
  getStorageQuotaSnapshot,
} from '@/lib/quota/storage-quota-policy';

describe('storage quota policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.userStorageQuota.upsert.mockResolvedValue({});
    mocks.tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mocks.tx.userStorageQuota.findUniqueOrThrow.mockResolvedValue({ limitBytes: 1000n });
    // 400 bytes active + 0 trash by default; individual tests override to
    // exercise the trash-counts-toward-quota and derived-storage paths.
    mocks.getPhysicalStorageUsage.mockResolvedValue({ activeBytes: 400n, trashBytes: 0n, totalBytes: 400n });
    mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 100n } });
    mocks.tx.storageQuotaReservation.create.mockResolvedValue({ id: 'reservation-1' });
    mocks.tx.storageQuotaReservation.updateMany.mockResolvedValue({ count: 1 });
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
        activeBytes: 400,
        trashBytes: 0,
      },
    });

    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.getPhysicalStorageUsage).toHaveBeenCalledWith(mocks.tx, 'user-1');
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

  it('counts soft-deleted trash bytes toward usage — a delete does not free quota until purge', async () => {
    // 400 active + 550 trash already exceeds the 1000 limit on its own,
    // so even a 1-byte upload must be rejected purely from retained trash.
    mocks.getPhysicalStorageUsage.mockResolvedValue({ activeBytes: 400n, trashBytes: 550n, totalBytes: 950n });
    mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 0n } });

    await expect(reserveUploadBytes('user-1', 51)).rejects.toBeInstanceOf(StorageQuotaExceededError);

    await expect(reserveUploadBytes('user-1', 50)).resolves.toMatchObject({
      snapshot: { usedBytes: 950, trashBytes: 550, activeBytes: 400 },
    });
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

  describe('commitUploadBytes (reserve-before-processing → commit real total)', () => {
    it('replaces the reservation with the real post-processing total, excluding its own prior bytes from reserved', async () => {
      // The reservation being committed already holds 100 of the 100
      // reservedBytes aggregate; readSnapshot must exclude reservation-1
      // itself so the real 300-byte total isn't double-counted against
      // its own provisional 100-byte hold.
      mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 0n } });

      await expect(commitUploadBytes('user-1', 'reservation-1', 300)).resolves.toEqual({
        id: 'reservation-1',
        snapshot: {
          usedBytes: 400,
          limitBytes: 1000,
          remainingBytes: 300,
          reservedBytes: 0,
          incomingBytes: 300,
          activeBytes: 400,
          trashBytes: 0,
        },
      });

      expect(mocks.tx.storageQuotaReservation.aggregate).toHaveBeenCalledWith({
        where: {
          ownerUserId: 'user-1',
          expiresAt: { gt: expect.any(Date) },
          id: { not: 'reservation-1' },
        },
        _sum: { bytes: true },
      });
      expect(mocks.tx.storageQuotaReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'reservation-1', ownerUserId: 'user-1' },
        data: { bytes: 300n, expiresAt: expect.any(Date) },
      });
    });

    it('rejects when the real total (including derived rendition bytes) no longer fits, leaving the reservation untouched', async () => {
      // 400 active + 601 requested > 1000 limit even with the reservation's
      // own bytes excluded from the concurrent-reserved figure.
      mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 0n } });

      await expect(commitUploadBytes('user-1', 'reservation-1', 601)).rejects.toBeInstanceOf(StorageQuotaExceededError);
      expect(mocks.tx.storageQuotaReservation.updateMany).not.toHaveBeenCalled();
    });

    it('is race-safe against a concurrent reservation: another in-flight upload still counts toward the limit', async () => {
      // Another concurrent upload holds a live 550-byte reservation. Even
      // though this commit excludes its OWN prior bytes, the sibling
      // reservation's bytes still count, so 400 active + 550 sibling + 100
      // real total exceeds the 1000 limit.
      mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 550n } });

      await expect(commitUploadBytes('user-1', 'reservation-1', 100)).rejects.toBeInstanceOf(StorageQuotaExceededError);
    });

    it('throws when the reservation is missing or already released', async () => {
      mocks.tx.storageQuotaReservation.aggregate.mockResolvedValue({ _sum: { bytes: 0n } });
      mocks.tx.storageQuotaReservation.updateMany.mockResolvedValue({ count: 0 });

      await expect(commitUploadBytes('user-1', 'reservation-missing', 100)).rejects.toThrow(
        'Storage quota reservation is missing or already released',
      );
    });

    it('rejects a non-positive-integer commit amount', async () => {
      await expect(commitUploadBytes('user-1', 'reservation-1', 0)).rejects.toThrow('actualBytes must be a positive safe integer');
      await expect(commitUploadBytes('user-1', 'reservation-1', -5)).rejects.toThrow('actualBytes must be a positive safe integer');
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
      activeBytes: 400,
      trashBytes: 0,
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
      activeBytes: 400,
      trashBytes: 0,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns enrollment_unavailable when the users row is missing', async () => {
    const { Prisma } = await import('@prisma/client');
    const fkViolation = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint violated: user_storage_quotas_user_id_fkey',
      { code: 'P2003', clientVersion: 'test' }
    );
    mocks.tx.userStorageQuota.upsert.mockRejectedValue(fkViolation);

    mocks.tx.user.findUnique.mockResolvedValue(null);
    await expect(getStorageQuotaSnapshot('user-without-row')).rejects.toMatchObject({ code: 'enrollment_unavailable' });
  });
});
