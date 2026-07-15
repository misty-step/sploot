import { Prisma } from '@prisma/client';
import type { SplootApiUploadErrorResponse, StorageQuotaSnapshot } from '@sploot/common';
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

export function storageQuotaError(snapshot: StorageQuotaSnapshot): SplootApiUploadErrorResponse {
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

  try {
    const snapshot = await executeTransactionWithRetry((tx) => readSnapshot(tx, userId));
    return toPublicSnapshot(snapshot);
  } catch (error) {
    // Auth deliberately survives identity-sync failures, so an authenticated
    // request can reach this read before its users row exists. The quota
    // upsert then hits the user FK; degrade to the default snapshot instead
    // of failing the whole stats read.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return {
        usedBytes: 0,
        limitBytes: DEFAULT_STORAGE_QUOTA_BYTES,
        remainingBytes: DEFAULT_STORAGE_QUOTA_BYTES,
        reservedBytes: 0,
      };
    }
    throw error;
  }
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

  return executeTransactionWithRetry(async (tx) => {
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

  const snapshot = await executeTransactionWithRetry(async (tx) => {
    const requested = BigInt(incomingBytes);
    const snapshot = await readSnapshot(tx, userId, requested);
    const wouldUse = snapshot.usedBytes + snapshot.reservedBytes + requested;

    if (wouldUse > snapshot.limitBytes) {
      throw new StorageQuotaExceededError(toPublicSnapshot(snapshot));
    }

    return snapshot;
  });

  return toPublicSnapshot(snapshot);
}

/**
 * Executes a Prisma serializable transaction with automated retry on deadlock or serialization conflicts (P2034).
 * Follows exponential backoff with jitter to maximize concurrency throughput.
 */
async function executeTransactionWithRetry<T>(
  action: (tx: any) => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 50
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma!.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: any) {
      // Detect P2034 (Prisma serialization failure)
      const isSerializationError =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      // Detect raw PostgreSQL transaction rollback/deadlock codes ('40001' is serialization failure, '40P01' is deadlock)
      const pgCode = error?.code || error?.meta?.code || '';
      const isRawPgConflict = pgCode === '40001' || pgCode === '40P01';
      // Fallback to error message parsing if error properties are wrapped differently by drivers
      const isDeadlockMsg =
        error instanceof Error &&
        (error.message.includes('deadlock detected') ||
          error.message.includes('serialization failure') ||
          error.message.includes('could not serialize access'));
      if ((isSerializationError || isRawPgConflict || isDeadlockMsg) && attempt < maxAttempts) {
        // Exponential backoff delay with random jitter (up to 50%) to prevent lock-stepping retries
        const backoff = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.5 * backoff;
        const delay = backoff + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('BUG: Transaction retry loop terminated without throwing or returning.');
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
