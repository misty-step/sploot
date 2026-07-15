import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  cleanupExpiredUploadReceipts,
  UploadIdempotencyInProgressError,
  runIdempotentUpload,
} from '@/lib/upload/upload-idempotency';

const describeWithDatabase = process.env.DATABASE_URL && prisma ? describe : describe.skip;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describeWithDatabase('upload idempotency receipt against Postgres', () => {
  let ownerUserId: string;

  beforeAll(async () => {
    ownerUserId = `upload-idempotency-${randomUUID()}`;
    await prisma!.user.create({
      data: { id: ownerUserId, email: `${ownerUserId}@example.test` },
    });
  });

  afterAll(async () => {
    await prisma!.user.delete({ where: { id: ownerUserId } });
  });

  it('allows one active execution, rejects the concurrent P2002 contender, and replays JSON-stable completion', async () => {
    const key = `same-${randomUUID()}`;
    const gate = deferred();
    const started = deferred();
    let executions = 0;
    const result = {
      kind: 'created' as const,
      statusCode: 201,
      asset: { id: 'asset-1', size: 42 },
    };

    const first = runIdempotentUpload(ownerUserId, key, async () => {
      executions += 1;
      started.resolve();
      await gate.promise;
      return result;
    });
    await started.promise;

    await expect(runIdempotentUpload(ownerUserId, key, async () => {
      executions += 1;
      return result;
    })).rejects.toBeInstanceOf(UploadIdempotencyInProgressError);

    gate.resolve();
    await expect(first).resolves.toEqual(result);
    await expect(runIdempotentUpload(ownerUserId, key, async () => {
      executions += 1;
      return { kind: 'invalid', statusCode: 400 };
    })).resolves.toEqual(result);
    expect(executions).toBe(1);
  });

  it('reclaims an expired receipt and retains completed receipts until cleanup', async () => {
    const key = `expired-${randomUUID()}`;
    await prisma!.uploadIdempotency.create({
      data: {
        ownerUserId,
        key,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(0),
        retainedUntil: new Date(Date.now() + 60_000),
      },
    });

    await expect(runIdempotentUpload(ownerUserId, key, async () => ({
      kind: 'duplicate' as const,
      statusCode: 409,
      asset: { id: 'asset-1' },
    }))).resolves.toMatchObject({ kind: 'duplicate', statusCode: 409 });

    const oldKey = `old-${randomUUID()}`;
    const retainedKey = `retained-${randomUUID()}`;
    await prisma!.uploadIdempotency.createMany({ data: [
      {
        ownerUserId,
        key: oldKey,
        status: 'completed',
        result: { kind: 'created', statusCode: 201 },
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(0),
        retainedUntil: new Date(0),
      },
      {
        ownerUserId,
        key: retainedKey,
        status: 'completed',
        result: { kind: 'created', statusCode: 201 },
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(),
        retainedUntil: new Date(Date.now() + 86_400_000),
      },
    ] });

    await expect(cleanupExpiredUploadReceipts()).resolves.toBeGreaterThanOrEqual(1);
    await expect(prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key: oldKey } } })).resolves.toBeNull();
    await expect(prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key: retainedKey } } })).resolves.toBeTruthy();
  });

  it('replays the winner when a second real worker completes after the first lease expires', async () => {
    const key = `completion-race-${randomUUID()}`;
    const winner = { kind: 'duplicate' as const, statusCode: 409, asset: { id: 'winner' } };
    const firstResult = { kind: 'created' as const, statusCode: 201, asset: { id: 'loser' } };

    await expect(runIdempotentUpload(ownerUserId, key, async () => {
      const receipt = await prisma!.uploadIdempotency.findUnique({
        where: { upload_idempotency_owner_key: { ownerUserId, key } },
      });
      expect(receipt).toBeTruthy();
      await prisma!.uploadIdempotency.update({
        where: { id: receipt!.id },
        data: { leaseExpiresAt: new Date(0) },
      });
      await expect(runIdempotentUpload(ownerUserId, key, async () => winner)).resolves.toEqual(winner);
      return firstResult;
    })).resolves.toEqual(winner);
  });

  it('renews a held execution beyond its initial lease, then fences its late completion after reclaim', async () => {
    const key = `renewal-race-${randomUUID()}`;
    const started = deferred();
    const gate = deferred();
    const first = runIdempotentUpload(ownerUserId, key, async () => {
      started.resolve();
      await gate.promise;
      return { kind: 'created' as const, statusCode: 201, asset: { id: 'late-loser' } };
    }, { leaseMs: 50, renewalIntervalMs: 10 });
    await started.promise;
    const initial = await prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key } } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const renewed = await prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key } } });
    expect(renewed!.leaseExpiresAt.getTime()).toBeGreaterThan(initial!.leaseExpiresAt.getTime());

    await prisma!.uploadIdempotency.update({ where: { id: renewed!.id }, data: { leaseExpiresAt: new Date(0) } });
    const winner = { kind: 'duplicate' as const, statusCode: 409, asset: { id: 'winner' } };
    await expect(runIdempotentUpload(ownerUserId, key, async () => winner, { leaseMs: 50, renewalIntervalMs: 10 })).resolves.toEqual(winner);
    gate.resolve();
    await expect(first).resolves.toEqual(winner);
    expect((await prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key } } }))!.result).toMatchObject(winner);
  });

  it('sweeps only stale processing receipts and preserves live processing proof', async () => {
    const abandonedKey = `abandoned-${randomUUID()}`;
    const liveKey = `live-${randomUUID()}`;
    const abandoned = await prisma!.uploadIdempotency.create({
      data: {
        ownerUserId,
        key: abandonedKey,
        status: 'processing',
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(0),
        retainedUntil: new Date(Date.now() + 60_000),
      },
    });
    await prisma!.uploadIdempotency.update({ where: { id: abandoned.id }, data: { updatedAt: new Date(0) } });
    await prisma!.uploadIdempotency.create({
      data: {
        ownerUserId,
        key: liveKey,
        status: 'processing',
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 60_000),
        retainedUntil: new Date(Date.now() + 60_000),
      },
    });

    await cleanupExpiredUploadReceipts();
    await expect(prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key: abandonedKey } } })).resolves.toBeNull();
    await expect(prisma!.uploadIdempotency.findUnique({ where: { upload_idempotency_owner_key: { ownerUserId, key: liveKey } } })).resolves.toBeTruthy();
  });

  it('exposes the receipt columns needed for indexed readback and rollback posture', async () => {
    const columns = await prisma!.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'upload_idempotency'
    `;
    expect(columns.map(({ column_name }) => column_name)).toEqual(expect.arrayContaining([
      'owner_user_id', 'key', 'status', 'result', 'lease_token', 'lease_expires_at', 'retained_until',
    ]));
    const indexes = await prisma!.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'upload_idempotency'
    `;
    expect(indexes.map(({ indexname }) => indexname)).toContain('upload_idempotency_status_lease_expires_at_idx');
  });
});
