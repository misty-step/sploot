import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createStorageConfig, storageConfigFingerprint } from '@/lib/storage/config';
import { commitCutover, inventory, manifestSha256, restoreCutoverMappings } from '@/scripts/storage-portability';

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

  it('restores the post-regeneration Vercel peer, not the stale pre-cutover Vercel identity, and leaves exactly one active replica when a target-phase thumbnail regeneration ran before rollback', async () => {
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
      { logicalKey: 'assets/storage-portability-target-regen/original.png', sourceKey: 'uploads/original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-target-regen/thumb.png', sourceKey: 'uploads/thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'b'.repeat(64), contentType: 'image/png' },
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
      checksumSha256: 'storage-portability-target-regen-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);
    // Post-cutover: state.generation is 1; the thumbnail rendition has an
    // active s3 replica at generation=1 and an inactive vercel snapshot at
    // generation=1, exactly like the plain-rollback test above.

    // Simulate regenerate-thumbnails running while phase='target': it writes
    // through ConfiguredStorageWriter, whose portable store still dual-writes
    // both providers even in target phase (target first, legacy second), and
    // inserts both replicas — insert-only, no deactivation of the superseded
    // generation=1 pair, because the app runtime role has no UPDATE grant on
    // this table. Both new rows share one fresh unix-seconds generation.
    const regenGeneration = Math.floor(Date.now() / 1000) + 1000;
    const regenVercelKey = 'uploads/regenerated-thumb.png';
    const regenVercelUrl = 'https://source.public.blob.vercel-storage.com/uploads/regenerated-thumb.png';
    const regenS3Key = 'assets/storage-portability-target-regen/thumb-regen.png';
    const regenS3Url = 'https://objects.example.test/sploot/assets/storage-portability-target-regen/thumb-regen.png';
    await admin.assetStorageReplica.createMany({ data: [
      { assetId, rendition: 'thumbnail', provider: 's3', sourceKey: null, logicalKey: regenS3Key, deliveryUrl: regenS3Url, size: 3, sha256: 'e'.repeat(64), contentType: 'image/png', generation: regenGeneration, active: true },
      { assetId, rendition: 'thumbnail', provider: 'vercel', sourceKey: regenVercelKey, logicalKey: regenVercelKey, deliveryUrl: regenVercelUrl, size: 3, sha256: 'e'.repeat(64), contentType: 'image/png', generation: regenGeneration, active: false },
    ] });
    // regenerate-thumbnails' own asset.update: the asset now points at the
    // fresh s3 object, not the cutover-time one.
    await admin.asset.update({ where: { id: assetId }, data: {
      thumbnailUrl: regenS3Url, thumbnailStorageKey: regenS3Key, thumbnailStorageSourceKey: null,
    } });

    await restoreCutoverMappings(config, digest, admin);

    const asset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    // Original rendition never regenerated — restores to its ordinary
    // pre-cutover identity exactly like the plain-rollback test.
    expect(asset.storageProvider).toBe('vercel');
    expect(asset.storageKey).toBe(manifest[0]!.logicalKey);
    expect(asset.storageSourceKey).toBe(manifest[0]!.sourceKey);
    expect(asset.blobUrl).toBe('https://source.public.blob.vercel-storage.com/uploads/original.png');
    // Thumbnail rendition must restore to the *regenerated* Vercel peer —
    // never the stale pre-cutover Vercel identity the plain-rollback test
    // uses — because that peer is the current live object.
    expect(asset.thumbnailStorageKey).toBe(regenVercelKey);
    expect(asset.thumbnailStorageSourceKey).toBe(regenVercelKey);
    expect(asset.thumbnailUrl).toBe(regenVercelUrl);
    expect(asset.thumbnailUrl).not.toBe('https://source.public.blob.vercel-storage.com/uploads/thumb.png');

    const replicaRows = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { generation: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, generation: true, active: true } });
    expect(replicaRows).toHaveLength(6);
    const thumbnailRows = replicaRows.filter(row => row.rendition === 'thumbnail');
    const activeThumbnailRows = thumbnailRows.filter(row => row.active);
    // Exactly one active replica remains for the regenerated rendition —
    // never both the stale cutover-generation target row and the fresher
    // regen row, never zero.
    expect(activeThumbnailRows).toHaveLength(1);
    expect(activeThumbnailRows[0]).toMatchObject({ provider: 'vercel', generation: regenGeneration });
    // The regen's own s3 replica — the "later target replica" the bug used
    // to leave active — is deactivated.
    expect(thumbnailRows.find(row => row.provider === 's3' && row.generation === regenGeneration)?.active).toBe(false);
    // The stale cutover-generation pair is deactivated too, not resurrected.
    expect(thumbnailRows.find(row => row.provider === 'vercel' && row.generation === 1)?.active).toBe(false);
    expect(thumbnailRows.find(row => row.provider === 's3' && row.generation === 1)?.active).toBe(false);
    // Original rendition is unaffected: single active legacy replica, as in
    // the plain-rollback test.
    const originalRows = replicaRows.filter(row => row.rendition === 'original');
    expect(originalRows.filter(row => row.active)).toHaveLength(1);
    expect(originalRows.find(row => row.active)).toMatchObject({ provider: 'vercel', generation: 1 });

    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'rollback', generation: 1 });
  });

  it('fails closed and leaves the database unchanged when a target-provider replica has no paired source-provider peer at its generation', async () => {
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
      { logicalKey: 'assets/storage-portability-incomplete-pair/original.png', sourceKey: 'uploads/original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-incomplete-pair/thumb.png', sourceKey: 'uploads/thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'b'.repeat(64), contentType: 'image/png' },
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
      checksumSha256: 'storage-portability-incomplete-pair-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);

    // Simulate a broken/partial write: an active target-provider (s3) replica
    // at a fresh generation with no paired vercel replica at that same
    // generation — not a shape the app's atomic dual-write transaction can
    // normally produce, but exactly the "incomplete pair" rollback must never
    // paper over by falling back to some other (stale, mismatched) generation.
    const orphanGeneration = Math.floor(Date.now() / 1000) + 2000;
    await admin.assetStorageReplica.create({ data: {
      assetId, rendition: 'thumbnail', provider: 's3', sourceKey: null,
      logicalKey: 'assets/storage-portability-incomplete-pair/thumb-orphan.png',
      deliveryUrl: 'https://objects.example.test/sploot/assets/storage-portability-incomplete-pair/thumb-orphan.png',
      size: 3, sha256: 'f'.repeat(64), contentType: 'image/png', generation: orphanGeneration, active: true,
    } });

    const beforeAsset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    const beforeReplicas = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { generation: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, generation: true, active: true } });
    const beforeState = await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } });

    await expect(restoreCutoverMappings(config, digest, admin)).rejects.toThrow(/complete provider-paired replica generation/);

    // Fails closed: not just the broken rendition, the whole transaction —
    // including the otherwise-healthy original rendition and the cutover
    // state — must be untouched, never a partial/mixed-generation commit.
    const afterAsset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    expect(afterAsset).toEqual(beforeAsset);
    const afterReplicas = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { generation: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, generation: true, active: true } });
    expect(afterReplicas).toEqual(beforeReplicas);
    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual(beforeState);
  });


  it('fails closed and leaves the database unchanged when the state fence is lost immediately before the rollback phase-advance update lands', async () => {
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
      { logicalKey: 'assets/storage-portability-lost-fence/original.png', sourceKey: 'uploads/original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
      { logicalKey: 'assets/storage-portability-lost-fence/thumb.png', sourceKey: 'uploads/thumb.png', rendition: 'thumbnail' as const, sourceProvider: 'vercel', size: 3, sha256: 'b'.repeat(64), contentType: 'image/png' },
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
      checksumSha256: 'storage-portability-lost-fence-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    await commitCutover(manifest, config, digest, admin);

    const beforeAsset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    const beforeReplicas = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { generation: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, generation: true, active: true } });
    const beforeState = await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } });

    // Simulate a concurrent racer moving the fence between
    // restoreCutoverMappings' own initial read and its terminal
    // phase-advance update: wrap the real Postgres transaction client so
    // every statement executes for real EXCEPT the final
    // storageCutoverState.updateMany, whose result is forced to
    // { count: 0 } as if a concurrent writer had already claimed the row.
    // Every asset/replica mutation inside the same transaction still runs
    // against real Postgres, so this proves the WHOLE transaction — not
    // just the fence-check statement — rolls back when the count-guard
    // fires, exactly as commitCutover's sibling guard already does.
    const fencedAdmin = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => admin.$transaction((tx) => {
        const realUpdateMany = tx.storageCutoverState.updateMany.bind(tx.storageCutoverState);
        const wrappedCutoverState = new Proxy(tx.storageCutoverState, {
          get(target, prop, receiver) {
            if (prop === 'updateMany') {
              return async (...args: Parameters<typeof realUpdateMany>) => {
                // A real racer would have already updated the row (0 further
                // matches); we simulate that outcome directly rather than
                // actually running a second concurrent transaction.
                void args;
                return { count: 0 };
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        const wrappedTx = new Proxy(tx, {
          get(target, prop, receiver) {
            if (prop === 'storageCutoverState') return wrappedCutoverState;
            return Reflect.get(target, prop, receiver);
          },
        });
        return fn(wrappedTx);
      }),
    } as unknown as typeof admin;

    await expect(restoreCutoverMappings(config, digest, fencedAdmin)).rejects.toThrow(/[Rr]ollback fence lost/);

    // Fails closed: the asset columns, every replica row, and the cutover
    // state itself must be byte-for-byte unchanged — the lost fence must
    // roll back the mapping-restoration work done earlier in the SAME
    // transaction, not just skip the terminal phase write.
    const afterAsset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: {
      storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true,
      thumbnailStorageKey: true, thumbnailStorageSourceKey: true, thumbnailUrl: true,
    } });
    expect(afterAsset).toEqual(beforeAsset);
    const afterReplicas = await admin.assetStorageReplica.findMany({ where: { assetId }, orderBy: [{ rendition: 'asc' }, { generation: 'asc' }, { provider: 'asc' }], select: { rendition: true, provider: true, generation: true, active: true } });
    expect(afterReplicas).toEqual(beforeReplicas);
    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual(beforeState);
  });
});

describeWithDatabase('storage portability restricted sploot_storage_operator authority', () => {
  let admin: PrismaClient;
  let operator: PrismaClient;
  let operatorPassword: string;
  const userId = 'storage-portability-operator-user';
  const assetId = 'storage-portability-operator-asset';

  beforeAll(async () => {
    admin = new PrismaClient({ datasources: { db: { url: process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL! } } });
    // Grant LOGIN for this test run only, so the connection below
    // authenticates AS sploot_storage_operator over the wire -- proving the
    // grants under real Postgres privilege enforcement, never a SET
    // ROLE-from-superuser shortcut (which would retain the superuser's
    // bypass) and never the STRIPE_LEDGER_ADMIN_DATABASE_URL superuser
    // connection every other test in this file uses (that bypasses ALL
    // privilege checks regardless of grants, which is exactly how the
    // missing grant on `assets` stayed invisible).
    operatorPassword = randomBytes(32).toString('hex');
    await admin.$executeRawUnsafe(`ALTER ROLE sploot_storage_operator LOGIN PASSWORD '${operatorPassword}'`);
    const operatorUrl = new URL(process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL!);
    operatorUrl.username = 'sploot_storage_operator';
    operatorUrl.password = operatorPassword;
    operator = new PrismaClient({ datasources: { db: { url: operatorUrl.toString() } } });
  });

  afterAll(async () => {
    await operator.$disconnect();
    await admin.$executeRawUnsafe('ALTER ROLE sploot_storage_operator NOLOGIN').catch(() => undefined);
    await admin.$disconnect();
  });

  afterEach(async () => {
    await admin.asset.deleteMany({ where: { id: assetId } });
    await admin.user.deleteMany({ where: { id: userId } });
    await admin.storageMigrationEntry.deleteMany({ where: { logicalKey: { startsWith: 'assets/storage-portability-operator' } } });
    await admin.storageInventoryState.deleteMany({ where: { id: 'legacy-assets' } });
    await admin.storageCutoverState.deleteMany({ where: { id: 'default' } });
  });

  it('runs as the real non-superuser, non-inheriting sploot_storage_operator identity -- never a superuser bypass', async () => {
    const identity = await operator.$queryRawUnsafe<Array<{ sessionUser: string; isSuperuser: boolean; inherits: boolean }>>(
      'SELECT current_user AS "sessionUser", rolsuper AS "isSuperuser", rolinherit AS "inherits" FROM pg_roles WHERE rolname = current_user',
    );
    expect(identity[0]).toEqual({ sessionUser: 'sploot_storage_operator', isSuperuser: false, inherits: false });
  });

  it('denies every unrelated assets column and the table broadly, while the enumerated storage-identity columns remain granted', async () => {
    const tableGrants = await admin.$queryRawUnsafe<Array<{ hasSelect: boolean; hasUpdate: boolean; hasInsert: boolean; hasDelete: boolean }>>(
      `SELECT has_table_privilege('sploot_storage_operator','public.assets','SELECT') AS "hasSelect", has_table_privilege('sploot_storage_operator','public.assets','UPDATE') AS "hasUpdate", has_table_privilege('sploot_storage_operator','public.assets','INSERT') AS "hasInsert", has_table_privilege('sploot_storage_operator','public.assets','DELETE') AS "hasDelete"`,
    );
    // No broad table-level grant -- only the enumerated columns below.
    expect(tableGrants[0]).toEqual({ hasSelect: false, hasUpdate: false, hasInsert: false, hasDelete: false });

    const deniedColumns = await admin.$queryRawUnsafe<Array<{ allDenied: boolean }>>(
      `SELECT bool_and(NOT has_column_privilege('sploot_storage_operator', 'public.assets', column_name, 'SELECT') AND NOT has_column_privilege('sploot_storage_operator', 'public.assets', column_name, 'UPDATE')) AS "allDenied"
       FROM (VALUES ('favorite'), ('checksum_sha256'), ('phash'), ('share_slug'), ('owner_user_id'), ('size'), ('width'), ('height'), ('shuffle_key'), ('createdAt')) AS unrelated(column_name)`,
    );
    expect(deniedColumns[0]?.allDenied).toBe(true);

    const grantedColumns = await admin.$queryRawUnsafe<Array<{ allGranted: boolean }>>(
      `SELECT bool_and(has_column_privilege('sploot_storage_operator', 'public.assets', column_name, 'SELECT')) AS "allGranted"
       FROM (VALUES ('id'), ('deleted_at'), ('pathname'), ('mime'), ('storage_provider'), ('storage_key'), ('storage_source_key'), ('blob_url'), ('thumbnail_storage_key'), ('thumbnail_storage_source_key'), ('thumbnail_path'), ('thumbnail_url')) AS granted(column_name)`,
    );
    expect(grantedColumns[0]?.allGranted).toBe(true);

    // "updatedAt" is UPDATE-granted (Prisma's @updatedAt auto-timestamp
    // appends it to every Asset.update() SET clause regardless of what the
    // caller writes) but deliberately NOT SELECT-granted -- it is never
    // read by inventory/commitCutover/restoreCutoverMappings.
    const updatedAtGrants = await admin.$queryRawUnsafe<Array<{ hasUpdate: boolean; hasSelect: boolean }>>(
      `SELECT has_column_privilege('sploot_storage_operator', 'public.assets', 'updatedAt', 'UPDATE') AS "hasUpdate", has_column_privilege('sploot_storage_operator', 'public.assets', 'updatedAt', 'SELECT') AS "hasSelect"`,
    );
    expect(updatedAtGrants[0]).toEqual({ hasUpdate: true, hasSelect: false });

    // A denied column really fails over the literal restricted connection,
    // not just in the catalog: no has_column_privilege false negative.
    await expect(operator.$queryRawUnsafe('SELECT favorite FROM assets LIMIT 1')).rejects.toThrow(/permission denied/i);
    await expect(operator.$queryRawUnsafe("UPDATE assets SET favorite = true WHERE id = 'nonexistent'")).rejects.toThrow(/permission denied/i);
  });

  it('inventory reaches and commits under the real restricted operator role', async () => {
    await admin.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await admin.asset.create({ data: {
      id: assetId,
      ownerUserId: userId,
      blobUrl: 'https://source.public.blob.vercel-storage.com/uploads/operator-original.png',
      pathname: 'uploads/operator-original.png',
      storageProvider: 'vercel',
      mime: 'image/png',
      size: 3,
      checksumSha256: 'storage-portability-operator-checksum',
    } });
    const originalBytes = Buffer.from('png-bytes-for-operator-grant-proof');
    const fetchMock = vi.fn(async () => new Response(originalBytes, { status: 200, headers: { 'content-length': String(originalBytes.byteLength) } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      // The real requireOperatorAuthority() gate, the assets SELECT/UPDATE
      // grants, and the storage_migration_entries/storage_inventory_state
      // CRUD grants ALL run for real against Postgres as literal
      // sploot_storage_operator -- the exact combination that was
      // previously proven only under the STRIPE_LEDGER_ADMIN_DATABASE_URL
      // superuser connection everywhere else in this file.
      await inventory(10, undefined, operator);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const updated = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: { storageKey: true, storageSourceKey: true, storageSize: true, storageSha256: true } });
    expect(updated.storageSourceKey).toBe('uploads/operator-original.png');
    expect(updated.storageSize).toBe(originalBytes.byteLength);
    expect(updated.storageSha256).toMatch(/^[a-f0-9]{64}$/);
    const migrationEntry = await admin.storageMigrationEntry.findFirst({ where: { sourceKey: 'uploads/operator-original.png' } });
    expect(migrationEntry).not.toBeNull();
    const inventoryState = await admin.storageInventoryState.findUnique({ where: { id: 'legacy-assets' } });
    expect(inventoryState?.cursor).toBe(assetId);
  });

  it('commitCutover and restoreCutoverMappings commit under the real restricted operator role, not superuser', async () => {
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
      { logicalKey: 'assets/storage-portability-operator/original.png', sourceKey: 'uploads/operator-original.png', rendition: 'original' as const, sourceProvider: 'vercel', size: 3, sha256: 'a'.repeat(64), contentType: 'image/png' },
    ];
    const digest = manifestSha256(manifest);
    await admin.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await admin.asset.create({ data: {
      id: assetId,
      ownerUserId: userId,
      blobUrl: 'https://source.public.blob.vercel-storage.com/uploads/operator-original.png',
      pathname: 'uploads/operator-original.png',
      storageProvider: 'vercel',
      storageKey: manifest[0]!.logicalKey,
      storageSourceKey: manifest[0]!.sourceKey,
      mime: 'image/png',
      size: 3,
      checksumSha256: 'storage-portability-operator-cutover-checksum',
    } });
    await admin.storageCutoverState.create({ data: { id: 'default', phase: 'dual-write', generation: 0, providerFingerprint: storageConfigFingerprint(config), manifestSha256: digest } });

    // Both calls take `operator` (the literal restricted connection) as
    // their `database` param instead of every other test's `admin`
    // (superuser) -- this is the one substitution that turns "passes under
    // a mocked sessionUser / superuser fallback" into a real proof.
    await commitCutover(manifest, config, digest, operator);
    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'target', generation: 1 });

    await restoreCutoverMappings(config, digest, operator);
    const asset = await admin.asset.findUniqueOrThrow({ where: { id: assetId }, select: { storageProvider: true, storageKey: true, storageSourceKey: true, blobUrl: true } });
    expect(asset.storageProvider).toBe('vercel');
    expect(asset.storageKey).toBe(manifest[0]!.logicalKey);
    expect(asset.blobUrl).toBe('https://source.public.blob.vercel-storage.com/uploads/operator-original.png');
    expect(await admin.storageCutoverState.findUnique({ where: { id: 'default' }, select: { phase: true, generation: true } })).toEqual({ phase: 'rollback', generation: 1 });
  });
});
