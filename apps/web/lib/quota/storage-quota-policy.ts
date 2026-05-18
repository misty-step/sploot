import { Prisma } from '@prisma/client';
import type { StorageQuotaSnapshot } from '@sploot/common';
import { prisma } from '@/lib/db';

export const DEFAULT_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

interface StorageQuotaSnapshotBigInt {
  usedBytes: bigint;
  limitBytes: bigint;
  remainingBytes: bigint;
  reservedBytes: bigint;
  incomingBytes?: bigint;
}

export interface StorageQuotaReservation {
  id: string;
  snapshot: StorageQuotaSnapshot;
}

export class StorageQuotaExceededError extends Error {
  constructor(public readonly snapshot: StorageQuotaSnapshot) {
    super('Storage quota exceeded');
    this.name = 'StorageQuotaExceededError';
  }
}

export function storageQuotaError(snapshot: StorageQuotaSnapshot) {
  return {
    success: false,
    error: 'Storage quota exceeded',
    code: 'quota_exceeded' as const,
    retryable: false,
    quota: snapshot,
    action: {
      type: 'manage_storage' as const,
      label: 'Manage storage',
      href: '/app/settings',
    },
  };
}

function toNumber(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

function toPublicSnapshot(snapshot: StorageQuotaSnapshotBigInt): StorageQuotaSnapshot {
  return {
    usedBytes: toNumber(snapshot.usedBytes),
    limitBytes: toNumber(snapshot.limitBytes),
    remainingBytes: toNumber(snapshot.remainingBytes),
    reservedBytes: toNumber(snapshot.reservedBytes),
    incomingBytes: snapshot.incomingBytes === undefined ? undefined : toNumber(snapshot.incomingBytes),
  };
}

async function readSnapshot(tx: any, userId: string, incomingBytes?: bigint): Promise<StorageQuotaSnapshotBigInt> {
  const now = new Date();

  await tx.userStorageQuota.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      limitBytes: DEFAULT_STORAGE_QUOTA_BYTES,
    },
  });

  await tx.$executeRaw`SELECT "user_id" FROM "user_storage_quotas" WHERE "user_id" = ${userId} FOR UPDATE`;

  await tx.storageQuotaReservation.deleteMany({
    where: {
      ownerUserId: userId,
      expiresAt: { lte: now },
    },
  });

  const quota = await tx.userStorageQuota.findUniqueOrThrow({
    where: { userId },
    select: { limitBytes: true },
  });

  const assetAggregate = await tx.asset.aggregate({
    where: {
      ownerUserId: userId,
      deletedAt: null,
    },
    _sum: { size: true },
  });
  const reservationAggregate = await tx.storageQuotaReservation.aggregate({
    where: {
      ownerUserId: userId,
      expiresAt: { gt: now },
    },
    _sum: { bytes: true },
  });

  const usedBytes = BigInt(assetAggregate._sum.size ?? 0);
  const reservedBytes = BigInt(reservationAggregate._sum.bytes ?? 0);
  const limitBytes = BigInt(quota.limitBytes);
  const requested = incomingBytes ?? BigInt(0);
  const remainingBytes = limitBytes - usedBytes - reservedBytes - requested;

  return {
    usedBytes,
    limitBytes,
    reservedBytes,
    incomingBytes,
    remainingBytes: remainingBytes > BigInt(0) ? remainingBytes : BigInt(0),
  };
}

export async function getStorageQuotaSnapshot(userId: string): Promise<StorageQuotaSnapshot> {
  if (!prisma || typeof (prisma as any).$transaction !== 'function') {
    return {
      usedBytes: 0,
      limitBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      remainingBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      reservedBytes: 0,
    };
  }

  const snapshot = await prisma.$transaction((tx) => readSnapshot(tx, userId), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return toPublicSnapshot(snapshot);
}

export async function reserveUploadBytes(
  userId: string,
  incomingBytes: number
): Promise<StorageQuotaReservation> {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes <= 0) {
    throw new Error('incomingBytes must be a positive safe integer');
  }

  if (!prisma) {
    throw new Error('Database not configured');
  }

  return prisma.$transaction(async (tx) => {
    const requested = BigInt(incomingBytes);
    const snapshot = await readSnapshot(tx, userId, requested);
    const wouldUse = snapshot.usedBytes + snapshot.reservedBytes + requested;

    if (wouldUse > snapshot.limitBytes) {
      throw new StorageQuotaExceededError(toPublicSnapshot(snapshot));
    }

    const reservation = await tx.storageQuotaReservation.create({
      data: {
        ownerUserId: userId,
        bytes: requested,
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      },
      select: { id: true },
    });

    return {
      id: reservation.id,
      snapshot: toPublicSnapshot(snapshot),
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function checkUploadBytesAllowed(
  userId: string,
  incomingBytes: number
): Promise<StorageQuotaSnapshot> {
  if (!Number.isSafeInteger(incomingBytes) || incomingBytes <= 0) {
    throw new Error('incomingBytes must be a positive safe integer');
  }

  if (!prisma) {
    throw new Error('Database not configured');
  }

  return prisma.$transaction(async (tx) => {
    const requested = BigInt(incomingBytes);
    const snapshot = await readSnapshot(tx, userId, requested);
    const wouldUse = snapshot.usedBytes + snapshot.reservedBytes + requested;

    if (wouldUse > snapshot.limitBytes) {
      throw new StorageQuotaExceededError(toPublicSnapshot(snapshot));
    }

    return toPublicSnapshot(snapshot);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function releaseStorageQuotaReservation(reservationId: string | null | undefined): Promise<void> {
  if (!reservationId || !prisma) {
    return;
  }

  try {
    await prisma.storageQuotaReservation.deleteMany({
      where: { id: reservationId },
    });
  } catch {
    // Reservation cleanup is best-effort. Stale reservations expire quickly and
    // must not turn an already-committed asset into a failed upload.
  }
}
