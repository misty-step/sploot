import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

const IDEMPOTENCY_LEASE_MS = 2 * 60 * 1000;

export class UploadIdempotencyInProgressError extends Error {
  constructor() {
    super('Upload is already being processed; retry with the same idempotency key.');
    this.name = 'UploadIdempotencyInProgressError';
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
 * requests; completed JSON is replayed, so stale client recovery does not
 * re-enter the vendor-costing ingestion pipeline.
 */
export async function runIdempotentUpload<T>(
  ownerUserId: string,
  key: string,
  execute: () => Promise<T>,
): Promise<T> {
  if (!prisma) throw new Error('Upload idempotency requires a database');

  const claim = await claimUpload<T>(ownerUserId, key);
  if (claim.completed) return claim.result;

  try {
    const result = await execute();
    const serialized = JSON.parse(JSON.stringify(result)) as T;
    await prisma.uploadIdempotency.updateMany({
      where: { id: claim.claim.id, leaseToken: claim.claim.leaseToken, status: 'processing' },
      data: { status: 'completed', result: serialized as Prisma.InputJsonValue, leaseExpiresAt: new Date(Date.now() + IDEMPOTENCY_LEASE_MS) },
    });
    return result;
  } catch (error) {
    await prisma.uploadIdempotency.deleteMany({
      where: { id: claim.claim.id, leaseToken: claim.claim.leaseToken, status: 'processing' },
    });
    throw error;
  }
}

async function claimUpload<T>(ownerUserId: string, key: string): Promise<UploadClaim<T>> {
  if (!prisma) throw new Error('Upload idempotency requires a database');
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + IDEMPOTENCY_LEASE_MS);
  const where = { upload_idempotency_owner_key: { ownerUserId, key } } as const;

  try {
    const created = await prisma.uploadIdempotency.create({
      data: { ownerUserId, key, leaseToken, leaseExpiresAt },
    });
    return { completed: false, claim: { id: created.id, leaseToken } };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Unique constraint')) throw error;
  }

  const existing = await prisma.uploadIdempotency.findUnique({ where });
  if (!existing) return claimUpload(ownerUserId, key);
  if (existing.status === 'completed' && existing.result !== null) {
    return { completed: true, result: existing.result as T };
  }

  const reclaimed = await prisma.uploadIdempotency.updateMany({
    where: { id: existing.id, status: 'processing', leaseExpiresAt: { lt: now } },
    data: { leaseToken, leaseExpiresAt },
  });
  if (reclaimed.count !== 1) throw new UploadIdempotencyInProgressError();
  return { completed: false, claim: { id: existing.id, leaseToken } };
}
