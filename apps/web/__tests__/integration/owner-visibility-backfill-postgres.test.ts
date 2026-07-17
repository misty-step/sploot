import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma ? describe.sequential : describe.skip;
const userId = 'owner-visibility-backfill-user';
const staleOwnerId = userId + '-stale';
const assetIds = Array.from({ length: 3 }, (_, index) => userId + '-' + index);

describeWithDatabase('Postgres owner visibility backfill', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: staleOwnerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({ data: { id: userId, email: userId + '@example.test' } });
    await prisma.user.create({ data: { id: staleOwnerId, email: staleOwnerId + '@example.test' } });
    await prisma.asset.createMany({
      data: assetIds.map((id, index) => ({
        id,
        ownerUserId: userId,
        blobUrl: 'https://owner-visibility.public.blob.vercel-storage.com/' + id + '.png',
        pathname: id + '.png',
        mime: 'image/png',
        size: index + 1,
        checksumSha256: id + '-checksum',
      })),
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "asset_embeddings" (
        "asset_id", "model_name", "model_version", "dim", "image_embedding",
        "status", "createdAt", "updatedAt"
      )
      SELECT
        id, 'owner-visibility-test', 'v1', 768,
        ('[' || repeat('0.1,', 767) || '0.1]')::vector(768),
        'ready', NOW(), NOW()
      FROM unnest(${assetIds}::text[]) AS ids(id)
    `);
    // The visibility trigger is intentionally bypassed only in this fixture so
    // the resumable procedure has a real mismatched projection to repair. The
    // stale owner is valid, so the final FK remains enforced throughout.
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE "asset_embeddings" DISABLE TRIGGER "asset_embeddings_sync_visibility"`);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "asset_embeddings"
      SET "owner_user_id" = ${staleOwnerId}, "asset_deleted_at" = NOW()
      WHERE "asset_id" = ANY(${assetIds})
    `);
    await prisma.$executeRaw(Prisma.sql`ALTER TABLE "asset_embeddings" ENABLE TRIGGER "asset_embeddings_sync_visibility"`);
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.deleteMany({ where: { id: staleOwnerId } });
  });

  it('drains separate bounded batches and reaches zero before enforcement', async () => {
    const before = await prisma.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(before[0]?.remaining ?? 0)).toBe(assetIds.length);

    await prisma.$executeRaw(Prisma.sql`CALL "sploot_backfill_asset_embedding_owner_visibility"(${2})`);
    const afterFirst = await prisma.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(afterFirst[0]?.remaining ?? 0)).toBe(1);

    await prisma.$executeRaw(Prisma.sql`CALL "sploot_backfill_asset_embedding_owner_visibility"(${2})`);
    const afterSecond = await prisma.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(afterSecond[0]?.remaining ?? 0)).toBe(0);

    const projection = await prisma.$queryRaw<Array<{ owner_user_id: string; asset_deleted_at: Date | null }>>(Prisma.sql`
      SELECT "owner_user_id", "asset_deleted_at"
      FROM "asset_embeddings"
      WHERE "asset_id" = ${assetIds[0]}
    `);
    expect(projection[0]).toEqual({ owner_user_id: userId, asset_deleted_at: null });
  });
});
