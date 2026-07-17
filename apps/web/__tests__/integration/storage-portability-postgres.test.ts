import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createStorageConfig, storageConfigFingerprint } from '@/lib/storage/config';
import { commitCutover, manifestSha256, restoreCutoverMappings } from '@/scripts/storage-portability';

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

  it('restores both distinct pre-cutover key columns and reactivates exactly the legacy replica on rollback', async () => {
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
    // The canonical logical key (already inventoried) and the raw legacy
    // provider key are deliberately different strings here, matching the
    // real post-inventory shape: storageKey holds a clean canonical name
    // while storageSourceKey keeps the original provider path.
    const manifest = [
      { logicalKey: 'assets/storage-portability-cutover/original.png', sourceKey: 'uploads/raw original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-cutover/thumb.png', sourceKey: 'uploads/raw thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'b'.repeat(64), contentType: 'image/png' },
    ];
    const digest = manifestSha256(manifest);
    await admin.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await admin.asset.create({ data: {
      id: assetId,
      ownerUserId: userId,
      blobUrl: 'https://source.public.blob.vercel-storage.com/uploads/raw%20original.png',
      thumbnailUrl: 'https://source.public.blob.vercel-storage.com/uploads/raw%20thumb.png',
      pathname: 'uploads/original.png',
      thumbnailPath: 'uploads/thumb.png',
      storageProvider: 'vercel',
      storageKey: manifest[0]!.logicalKey,
      storageSourceKey: manifest[0]!.sourceKey,
      thumbnailStorageKey: manifest[1]!.logicalKey,
      thumbnailStorageSourceKey: manifest[1]!.sourceKey,
      mime: 'image/png',
      size: 3,
      checksumSha256: 'storage-portability-rollback-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);
    await restoreCutoverMappings(config, digest, admin);

    const asset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    expect(asset.storageProvider).toBe('vercel');
    // storageKey must be restored to the canonical logical key, not
    // collapsed onto the raw legacy source key (or vice versa) — the two
    // remain distinct values, exactly as they were pre-cutover.
    expect(asset.storageKey).toBe(manifest[0]!.logicalKey);
    expect(asset.storageSourceKey).toBe(manifest[0]!.sourceKey);
    expect(asset.blobUrl).toBe('https://source.public.blob.vercel-storage.com/uploads/raw%20original.png');
    expect(asset.thumbnailStorageKey).toBe(manifest[1]!.logicalKey);
    expect(asset.thumbnailStorageSourceKey).toBe(manifest[1]!.sourceKey);
    expect(asset.thumbnailUrl).toBe('https://source.public.blob.vercel-storage.com/uploads/raw%20thumb.png');

    const replicaRows = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, active: true } });
    expect(replicaRows).toHaveLength(4);
    // Exactly the legacy replica is reactivated; the s3 target replica the
    // asset no longer points to is deactivated — never both, never neither.
    expect(replicaRows.filter(row => row.provider === 'vercel' && row.active)).toHaveLength(2);
    expect(replicaRows.filter(row => row.provider === 's3' && row.active)).toHaveLength(0);

    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'rollback', generation: 1 });
  });

  it('cutover snapshots the regenerated thumbnail replica, not the stale pre-regen upload row, because its unix-seconds generation outranks the small sequential counter', async () => {
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
    await admin.user.create({ data: { id: userId, email: userId + '@example.test' } });
    // Upload-time state: original + a since-superseded (stale) thumbnail,
    // both recorded with the small default generation the initial upload
    // path uses.
    const manifest = [
      { logicalKey: 'assets/storage-portability-generation-ordering/original.png', sourceKey: 'uploads/original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-generation-ordering/thumb.png', sourceKey: 'uploads/regenerated-thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'd'.repeat(64), contentType: 'image/png' },
    ];
    const digest = manifestSha256(manifest);
    await admin.asset.create({ data: {
      id: assetId,
      ownerUserId: userId,
      blobUrl: 'https://source.public.blob.vercel-storage.com/uploads/original.png',
      thumbnailUrl: 'https://source.public.blob.vercel-storage.com/uploads/regenerated-thumb.png',
      pathname: 'uploads/original.png',
      thumbnailPath: 'uploads/regenerated-thumb.png',
      storageProvider: 'vercel',
      // Already-inventoried shape (same convention the other cutover tests
      // use): storageKey/thumbnailStorageKey hold the canonical logical key,
      // storageSourceKey/thumbnailStorageSourceKey the raw legacy path. This
      // isolates the thing under test to the replica-generation lookup
      // below, not the asset-matching join.
      storageKey: manifest[0]!.logicalKey,
      storageSourceKey: manifest[0]!.sourceKey,
      thumbnailStorageKey: manifest[1]!.logicalKey,
      thumbnailStorageSourceKey: manifest[1]!.sourceKey,
      mime: 'image/png',
      size: 3,
      checksumSha256: 'storage-portability-generation-ordering-checksum',
    } });
    await admin.assetStorageReplica.create({ data: {
      assetId, rendition: 'thumbnail', provider: 'vercel',
      sourceKey: 'uploads/stale-crop-thumb.png', logicalKey: 'uploads/stale-crop-thumb.png',
      deliveryUrl: 'https://source.public.blob.vercel-storage.com/uploads/stale-crop-thumb.png',
      size: 3, sha256: 'c'.repeat(64), contentType: 'image/png', generation: 0, active: true,
    } });
    // The regen cron's exact insert shape: a second, later vercel replica
    // row for the same rendition, generation stamped as (roughly) the
    // current unix-seconds — never a small sequential integer — precisely
    // because the app runtime role cannot SELECT the `generation` column to
    // compute a real next value (column-restricted grant).
    const regenGeneration = Math.floor(Date.now() / 1000);
    await admin.assetStorageReplica.create({ data: {
      assetId, rendition: 'thumbnail', provider: 'vercel',
      sourceKey: 'uploads/regenerated-thumb.png', logicalKey: 'uploads/regenerated-thumb.png',
      deliveryUrl: 'https://source.public.blob.vercel-storage.com/uploads/regenerated-thumb.png',
      size: 3, sha256: 'd'.repeat(64), contentType: 'image/png', generation: regenGeneration, active: true,
    } });

    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);

    // commitCutover's blanket `UPDATE ... SET active=false WHERE asset_id=$1
    // AND rendition=$2` deactivates every pre-existing vercel row for this
    // rendition (both the stale generation-0 row and the regenerated row),
    // then inserts exactly one new snapshot row at the cutover's own fresh
    // generation (the pre-cutover state's generation 0 + 1 = 1) carrying
    // whatever `recordedSource` the ORDER BY generation DESC lookup picked.
    // Filtering on that exact generation — not just `active: false`, which
    // would also match the two now-deactivated pre-existing rows — isolates
    // the one row this test actually cares about.
    const snapshot = await admin.assetStorageReplica.findFirst({
      where: { assetId, rendition: 'thumbnail', provider: 'vercel', generation: 1 },
      select: { sourceKey: true, deliveryUrl: true, active: true },
    });
    expect(snapshot?.active).toBe(false);
    // The cutover-created inactive snapshot must carry the regenerated
    // object's identity — proof that commitCutover's `ORDER BY generation
    // DESC LIMIT 1` source-replica lookup picked the post-regen row over
    // the stale generation-0 upload row, so rollback would restore the
    // still-live regenerated object rather than resurrecting a deleted one.
    expect(snapshot?.sourceKey).toBe('uploads/regenerated-thumb.png');
    expect(snapshot?.deliveryUrl).toBe('https://source.public.blob.vercel-storage.com/uploads/regenerated-thumb.png');
    expect(snapshot?.sourceKey).not.toBe('uploads/stale-crop-thumb.png');
  });
});
