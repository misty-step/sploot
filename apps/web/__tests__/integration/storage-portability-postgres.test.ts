import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createStorageConfig, storageConfigFingerprint } from '@/lib/storage/config';
import { commitCutover, manifestSha256 } from '@/scripts/storage-portability';

const describeWithDatabase = process.env.DATABASE_URL && prisma ? describe.sequential : describe.skip;

describeWithDatabase('storage portability PostgreSQL authority', () => {
  const userId = 'storage-portability-cutover-user';
  const assetId = 'storage-portability-cutover-asset';
  let previousState: Awaited<ReturnType<typeof prisma.storageCutoverState.findUnique>>;

  afterEach(async () => {
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.storageMigrationEntry.deleteMany({ where: { logicalKey: { in: ['assets/storage-portability-cutover/original.png', 'assets/storage-portability-cutover/thumb.png'] } } });
    await prisma.storageCutoverState.delete({ where: { id: 'default' } }).catch(() => undefined);
    if (previousState) await prisma.storageCutoverState.create({ data: previousState });
    previousState = undefined;
  });

  it('atomically persists inactive Vercel and active S3 replicas for both renditions and advances the fence', async () => {
    previousState = await prisma.storageCutoverState.findUnique({ where: { id: 'default' } });
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
    await prisma.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await prisma.asset.create({ data: {
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
    await prisma.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest);

    const rows = await prisma.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, active: true, deliveryUrl: true } });
    expect(rows).toHaveLength(4);
    expect(rows.filter(row => row.provider === 'vercel' && !row.active)).toHaveLength(2);
    expect(rows.filter(row => row.provider === 's3' && row.active)).toHaveLength(2);
    expect(rows.find(row => row.rendition === 'original' && row.provider === 's3')?.deliveryUrl).toBe('https://objects.example.test/sploot/assets/storage-portability-cutover/original.png');
    expect(rows.find(row => row.rendition === 'thumbnail' && row.provider === 's3')?.deliveryUrl).toBe('https://objects.example.test/sploot/assets/storage-portability-cutover/thumb.png');
    expect(await prisma.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'target', generation: 1 });
  });
});
