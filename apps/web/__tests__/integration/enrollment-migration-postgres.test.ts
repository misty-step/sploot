import { afterEach, describe, expect, it } from 'vitest';
import { prisma, syncUser, logSearch } from '@/lib/db';
import {
  acquireEmbeddingAdmissionReservation,
  acquireEmbeddingRateLimit,
} from '@/lib/embedding-rate-limit';
import {
  acquireEnrollmentIdentityWriterLock,
  ENROLLMENT_IDENTITY_CONFLICT_CODE,
  withEnrollmentIdentityWriter,
} from '@/lib/enrollment/enrollment-policy';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const oldUserId = 'enrollment-orphan-old';
const newUserId = 'enrollment-orphan-new';
const concurrentNewUserIds = ['enrollment-orphan-race-a', 'enrollment-orphan-race-b'];
const email = 'enrollment-orphan@example.test';

async function cleanup(): Promise<void> {
  await prisma.searchLog.deleteMany({
    where: { userId: { in: [oldUserId, newUserId, ...concurrentNewUserIds] } },
  });
  await prisma.libraryExport.deleteMany({
    where: { ownerUserId: { in: [oldUserId, newUserId, ...concurrentNewUserIds] } },
  });
  await prisma.embeddingRateLease.deleteMany({
    where: { userId: { in: [oldUserId, newUserId, ...concurrentNewUserIds] } },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { in: [oldUserId, newUserId, ...concurrentNewUserIds] } },
        { email },
      ],
    },
  });
}

async function seedOrphan(): Promise<void> {
  await cleanup();
  await prisma.user.create({ data: { id: oldUserId, email } });
  await prisma.userIdentity.create({
    data: {
      userId: oldUserId,
      provider: 'clerk',
      providerSubject: oldUserId,
      email,
    },
  });
  const tag = await prisma.tag.create({ data: { ownerUserId: oldUserId, name: 'migration-fixture' } });
  const asset = await prisma.asset.create({
    data: {
      ownerUserId: oldUserId,
      blobUrl: 'https://fixture.public.blob.vercel-storage.com/migration.png',
      pathname: 'migration.png',
      mime: 'image/png',
      size: 10,
      checksumSha256: `migration-${Date.now()}`,
    },
  });
  await prisma.assetTag.create({ data: { assetId: asset.id, tagId: tag.id } });
  await prisma.libraryExport.create({
    data: {
      ownerUserId: oldUserId,
      snapshotAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      manifestVersion: '1.0',
      totalAssets: 1,
      totalOriginalBytes: BigInt(10),
      partBoundaries: [{ index: 0, afterId: null, count: 1, bytes: 10 }],
    },
  });
  await prisma.searchLog.create({
    data: { userId: oldUserId, query: 'migration', resultCount: 1, queryTime: 1 },
  });
  await prisma.userStorageQuota.create({ data: { userId: oldUserId, limitBytes: BigInt(1234) } });
  await prisma.storageQuotaReservation.create({
    data: { ownerUserId: oldUserId, bytes: BigInt(42), expiresAt: new Date(Date.now() + 60_000) },
  });
  await prisma.uploadToken.create({
    data: {
      userId: oldUserId,
      name: 'migration-fixture',
      tokenHash: `migration-token-${Date.now()}`,
      prefix: 'splt_fixture',
    },
  });
  await prisma.embeddingRateLease.create({
    data: {
      id: `migration-lease-${Date.now()}`,
      userId: oldUserId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

describeWithDatabase('identity-backed orphan enrollment migration', () => {
  afterEach(async () => {
    delete process.env.SPLOOT_ENROLLMENT_MODE;
    delete process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS;
    await cleanup();
  });

  it.each([
    ['closed', undefined],
    ['capped', '1'],
  ])('recovers a verified existing account while mode=%s without changing User count', async (mode, maxAccounts) => {
    await seedOrphan();
    process.env.SPLOOT_ENROLLMENT_MODE = mode;
    if (maxAccounts) process.env.SPLOOT_ENROLLMENT_MAX_ACCOUNTS = maxAccounts;

    await syncUser(newUserId, email);

    expect(await prisma.user.count({ where: { id: { in: [oldUserId, newUserId] } } })).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: oldUserId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: newUserId } })).not.toBeNull();
    expect(await prisma.asset.count({ where: { ownerUserId: newUserId } })).toBe(1);
    expect(await prisma.tag.count({ where: { ownerUserId: newUserId } })).toBe(1);
    expect(await prisma.searchLog.count({ where: { userId: newUserId } })).toBe(1);
    expect(await prisma.userStorageQuota.count({ where: { userId: newUserId } })).toBe(1);
    expect(await prisma.storageQuotaReservation.count({ where: { ownerUserId: newUserId } })).toBe(1);
    expect(await prisma.uploadToken.count({ where: { userId: newUserId } })).toBe(1);
    expect(await prisma.embeddingRateLease.count({ where: { userId: newUserId } })).toBe(1);
    expect(await prisma.libraryExport.count({ where: { ownerUserId: oldUserId } })).toBe(0);
    expect(await prisma.libraryExport.count({ where: { ownerUserId: newUserId } })).toBe(1);
    expect(await prisma.userIdentity.count({ where: { userId: newUserId, provider: 'clerk' } })).toBe(2);
    expect(await prisma.userIdentity.findUnique({
      where: { unique_provider_subject: { provider: 'clerk', providerSubject: newUserId } },
    })).toMatchObject({ userId: newUserId });
  });

  it('serializes concurrent identity replacement and rejects the conflicting contender', async () => {
    await seedOrphan();
    process.env.SPLOOT_ENROLLMENT_MODE = 'closed';

    const results = await Promise.allSettled(
      concurrentNewUserIds.map((id) => syncUser(id, email)),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => (
      result.status === 'rejected' &&
      (result.reason as { code?: unknown }).code === ENROLLMENT_IDENTITY_CONFLICT_CODE
    ))).toHaveLength(1);
    expect(await prisma.user.count({ where: { id: { in: [oldUserId, newUserId, ...concurrentNewUserIds] } } })).toBe(1);
  });

  it('moves a writer-held relation and rejects late legacy-identity writers', async () => {
    await seedOrphan();
    process.env.SPLOOT_ENROLLMENT_MODE = 'closed';

    let releaseWriter!: () => void;
    const writerReleased = new Promise<void>((resolve) => { releaseWriter = resolve; });
    let writerReady!: () => void;
    const writerStarted = new Promise<void>((resolve) => { writerReady = resolve; });

    const writer = prisma.$transaction(async (tx) => {
      await acquireEnrollmentIdentityWriterLock(tx, oldUserId);
      await tx.searchLog.create({
        data: { userId: oldUserId, query: 'writer-race', resultCount: 1, queryTime: 1 },
      });
      writerReady();
      await writerReleased;
    });

    await writerStarted;
    const migration = syncUser(newUserId, email);
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseWriter();
    await Promise.all([writer, migration]);

    expect(await prisma.searchLog.count({ where: { userId: oldUserId } })).toBe(0);
    expect(await prisma.searchLog.count({ where: { userId: newUserId } })).toBe(2);

    await logSearch(oldUserId, 'late-writer', 1, 1);
    expect(await prisma.searchLog.count({ where: { userId: oldUserId } })).toBe(0);

    const lateLease = await acquireEmbeddingRateLimit(oldUserId);
    expect(lateLease).toMatchObject({ allowed: false, reason: 'limiter_unavailable' });
    const lateAdmission = await acquireEmbeddingAdmissionReservation(oldUserId);
    expect(lateAdmission).toMatchObject({ allowed: false, reason: 'limiter_unavailable' });
    expect(await prisma.embeddingRateLease.count({ where: { userId: oldUserId } })).toBe(0);
  });

  it('fences an asset mutation through the production writer service', async () => {
    await seedOrphan();
    process.env.SPLOOT_ENROLLMENT_MODE = 'closed';

    const asset = await prisma.asset.findFirstOrThrow({ where: { ownerUserId: oldUserId } });
    let releaseWriter!: () => void;
    const writerReleased = new Promise<void>((resolve) => { releaseWriter = resolve; });
    let writerReady!: () => void;
    const writerStarted = new Promise<void>((resolve) => { writerReady = resolve; });

    const writer = withEnrollmentIdentityWriter(prisma, oldUserId, async (tx) => {
      await tx.asset.update({ where: { id: asset.id }, data: { favorite: true } });
      writerReady();
      await writerReleased;
    });

    await writerStarted;
    const migration = syncUser(newUserId, email);
    await new Promise((resolve) => setTimeout(resolve, 25));
    releaseWriter();
    await Promise.all([writer, migration]);

    await expect(withEnrollmentIdentityWriter(prisma, oldUserId, (tx) => tx.asset.update({
      where: { id: asset.id },
      data: { favorite: false },
    }))).rejects.toMatchObject({ code: 'enrollment_unavailable' });

    await expect(prisma.asset.findUnique({ where: { id: asset.id } })).resolves.toMatchObject({
      ownerUserId: newUserId,
      favorite: true,
    });
  });
});
