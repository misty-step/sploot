import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createStorageConfig, storageConfigFingerprint } from '@/lib/storage/config';
import { commitCutover, manifestSha256 } from '@/scripts/storage-portability';

const hasAuthorityDatabase = Boolean(process.env.DATABASE_URL && process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL);
const describeWithDatabase = hasAuthorityDatabase ? describe.sequential : describe.skip;

describeWithDatabase('storage portability PostgreSQL authority', () => {
  let admin: PrismaClient;
  beforeAll(() => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL! } } });
  });
  afterAll(async () => { await admin.$disconnect(); });
  const userId = 'storage-portability-cutover-user';
  const assetId = 'storage-portability-cutover-asset';
  let previousState: Awaited<ReturnType<typeof admin.storageCutoverState.findUnique>>;

  afterEach(async () => {
    await admin.asset.deleteMany({ where: { id: assetId } });
    await admin.user.deleteMany({ where: { id: userId } });
    await admin.storageMigrationEntry.deleteMany({ where: { logicalKey: { in: ['assets/storage-portability-cutover/original.png', 'assets/storage-portability-cutover/thumb.png'] } } });
    await admin.storageCutoverState.delete({ where: { id: 'default' } }).catch(() => undefined);
    if (previousState) await admin.storageCutoverState.create({ data: previousState });
    previousState = undefined;
  });

  it('atomically persists inactive Vercel and active S3 replicas for both renditions and advances the fence', async () => {
    previousState = await admin.storageCutoverState.findUnique({ where: { id: 'default' } });
    const config = createStorageConfig({
      provider: 's3',
      phase: 'dual-write',
      endpoint: 'https://objects.example.test',
      publicUrlBase: 'https://objects.example.test',
      bucket: 'sploot',
      accessKeyId: 'integration-id',
      secretAccessKey: 'integration-secret',
    });
    const manifest = [
      { logicalKey: 'assets/storage-portability-cutover/original.png', sourceKey: 'uploads/original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-cutover/thumb.png', sourceKey: 'uploads/thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'b'.repeat(64), contentType: 'image/png' },
    ];
    const digest = manifestSha256(manifest);
    await admin.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await admin.asset.create({ data: {
      id: assetId,
      ownerUserId: userId,
      blobUrl: 'https://source.public.blob.vercel-storage.com/uploads/original.png',
      thumbnailUrl: 'https://source.public.blob.vercel-storage.com/uploads/thumb.png',
      pathname: 'uploads/original.png',
      thumbnailPath: 'uploads/thumb.png',
      storageProvider: 'vercel',
      storageKey: manifest[0]!.logicalKey,
      storageSourceKey: manifest[0]!.sourceKey,
      thumbnailStorageKey: manifest[1]!.logicalKey,
      thumbnailStorageSourceKey: manifest[1]!.sourceKey,
      mime: 'image/png',
      size: 3,
      checksumSha256: 'storage-portability-cutover-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);

    const rows = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, active: true, deliveryUrl: true } });
    expect(rows).toHaveLength(4);
    expect(rows.filter(row => row.provider === 'vercel' && !row.active)).toHaveLength(2);
    expect(rows.filter(row => row.provider === 's3' && row.active)).toHaveLength(2);
    expect(rows.find(row => row.rendition === 'original' && row.provider === 's3')?.deliveryUrl).toBe('https://objects.example.test/sploot/assets/storage-portability-cutover/original.png');
    expect(rows.find(row => row.rendition === 'thumbnail' && row.provider === 's3')?.deliveryUrl).toBe('https://objects.example.test/sploot/assets/storage-portability-cutover/thumb.png');
    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'target', generation: 1 });
  });
});
