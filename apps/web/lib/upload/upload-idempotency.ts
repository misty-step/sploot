import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export const UPLOAD_IDEMPOTENCY_LEASE_MS = 2 * 60 * 1000;
export const UPLOAD_IDEMPOTENCY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class UploadIdempotencyInProgressError extends Error {
  constructor() {
    super('Upload is already being processed; retry with the same idempotency key.');
    this.name = 'UploadIdempotencyInProgressError';
  }
}

export class UploadIdempotencyLeaseLostError extends UploadIdempotencyInProgressError {
  constructor() {
    super();
    this.message = 'Upload ownership was lost before completion; retry with the same idempotency key.';
    this.name = 'UploadIdempotencyLeaseLostError';
  }
}

interface ClaimedUpload {
  id: string;
  leaseToken: string;
}

interface CompletedUpload<T> {
  completed: true;
  result: T;
}

interface ActiveUpload {
  completed: false;
  claim: ClaimedUpload;
}

type UploadClaim<T> = CompletedUpload<T> | ActiveUpload;

/**
 * Execute a queue upload once per user/key. A durable lease handles crashed
 * requests and completed JSON is replayed. The idempotency key fences the
 * request boundary; ingestImage's user/checksum uniqueness remains the
 * server-side asset replay oracle.
 */
export async function runIdempotentUpload<T>(
  ownerUserId: string,
  key: string,
  execute: () => Promise<T>,
): Promise<T> {
  if (!prisma) throw new Error('Upload idempotency requires a database');

  await cleanupExpiredUploadReceipts();
  const claim = await claimUpload<T>(ownerUserId, key);
  if (claim.completed) return claim.result;

  let result: T;
  try {
    result = await execute();
  } catch (error) {
    await prisma.uploadIdempotency.deleteMany({
      where: { id: claim.claim.id, leaseToken: claim.claim.leaseToken, status: 'processing' },
    });
    throw error;
  }

  const serialized = JSON.parse(JSON.stringify(result)) as T;
  const completed = await prisma.uploadIdempotency.updateMany({
      where: { id: claim.claim.id, leaseToken: claim.claim.leaseToken, status: 'processing' },
      data: {
        status: 'completed',
        result: serialized as Prisma.InputJsonValue,
        leaseExpiresAt: new Date(Date.now() + UPLOAD_IDEMPOTENCY_LEASE_MS),
        retainedUntil: new Date(Date.now() + UPLOAD_IDEMPOTENCY_RETENTION_MS),
      },
    });
  if (completed.count === 1) return result;

  const winner = await prisma.uploadIdempotency.findUnique({
    where: { upload_idempotency_owner_key: { ownerUserId, key } },
  });
  if (winner?.status === 'completed' && winner.result !== null) {
    return winner.result as T;
  }
  throw new UploadIdempotencyLeaseLostError();
}

/** Remove only completed receipts older than the replay-retention window. */
export async function cleanupExpiredUploadReceipts(now = new Date()): Promise<number> {
  if (!prisma) return 0;
  const result = await prisma.uploadIdempotency.deleteMany({
    where: { status: 'completed', retainedUntil: { lt: now } },
  });
  return result.count;
}

async function claimUpload<T>(ownerUserId: string, key: string): Promise<UploadClaim<T>> {
  if (!prisma) throw new Error('Upload idempotency requires a database');
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + UPLOAD_IDEMPOTENCY_LEASE_MS);
  const where = { upload_idempotency_owner_key: { ownerUserId, key } } as const;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await prisma.uploadIdempotency.create({
        data: {
          ownerUserId,
          key,
          leaseToken,
          leaseExpiresAt,
          retainedUntil: new Date(now.getTime() + UPLOAD_IDEMPOTENCY_RETENTION_MS),
        },
      });
      return { completed: false, claim: { id: created.id, leaseToken } };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }

    const existing = await prisma.uploadIdempotency.findUnique({ where });
    if (!existing) continue;
    if (existing.status === 'completed' && existing.result !== null) {
      return { completed: true, result: existing.result as T };
    }

    const reclaimed = await prisma.uploadIdempotency.updateMany({
      where: { id: existing.id, status: 'processing', leaseExpiresAt: { lt: now } },
      data: { leaseToken, leaseExpiresAt, retainedUntil: new Date(now.getTime() + UPLOAD_IDEMPOTENCY_RETENTION_MS) },
    });
    if (reclaimed.count !== 1) throw new UploadIdempotencyInProgressError();
    return { completed: false, claim: { id: existing.id, leaseToken } };
  }

  throw new UploadIdempotencyInProgressError();
}
