import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

const adminDatabaseUrl = process.env.STRIPE_LEDGER_ADMIN_DATABASE_URL;
const admin = adminDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: adminDatabaseUrl } } })
  : null;
const describeWithDatabase = process.env.DATABASE_URL && prisma && admin
  ? describe.sequential
  : describe.skip;
const userId = 'owner-visibility-backfill-user';
const staleOwnerId = userId + '-stale';
const assetIds = Array.from({ length: 3 }, (_, index) => userId + '-' + index);

// The application Prisma client must stay on the restricted DATABASE_URL. The
// authority client is used only for fixture operations that require ownership
// of the trigger/table, matching the deployment role boundary in CI.
describeWithDatabase('Postgres owner visibility backfill', () => {
  beforeAll(async () => {
    await admin!.user.deleteMany({ where: { id: { in: [userId, staleOwnerId] } } });
    await admin!.user.createMany({
      data: [userId, staleOwnerId].map((id) => ({ id, email: id + '@example.test' })),
    });
    await admin!.asset.createMany({
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
    await admin!.$executeRaw(Prisma.sql`
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
    // The app role is intentionally unable to disable triggers. Prove the
    // boundary first, then use the explicit authority fixture to create the
    // mismatched projection the resumable procedure must repair.
    await expect(prisma.$executeRaw(Prisma.sql`
      ALTER TABLE "asset_embeddings" DISABLE TRIGGER "asset_embeddings_sync_visibility"
    `)).rejects.toThrow(/permission denied|must be owner|42501/i);
    await admin!.$executeRaw(Prisma.sql`
      ALTER TABLE "asset_embeddings" DISABLE TRIGGER "asset_embeddings_sync_visibility"
    `);
    try {
      await admin!.$executeRaw(Prisma.sql`
        UPDATE "asset_embeddings"
        SET "owner_user_id" = ${staleOwnerId}, "asset_deleted_at" = NOW()
        WHERE "asset_id" = ANY(${assetIds})
      `);
    } finally {
      await admin!.$executeRaw(Prisma.sql`
        ALTER TABLE "asset_embeddings" ENABLE TRIGGER "asset_embeddings_sync_visibility"
      `);
    }
  }, 30_000);

  afterAll(async () => {
    await admin!.user.deleteMany({ where: { id: { in: [userId, staleOwnerId] } } });
    await admin!.$disconnect();
  });

  it('drains separate bounded batches and reaches zero before enforcement', async () => {
    const before = await admin!.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(before[0]?.remaining ?? 0)).toBe(assetIds.length);

    await admin!.$executeRaw(Prisma.sql`
      CALL "sploot_backfill_asset_embedding_owner_visibility"(${2})
    `);
    const afterFirst = await admin!.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(afterFirst[0]?.remaining ?? 0)).toBe(1);

    await admin!.$executeRaw(Prisma.sql`
      CALL "sploot_backfill_asset_embedding_owner_visibility"(${2})
    `);
    const afterSecond = await admin!.$queryRaw<Array<{ remaining: bigint }>>(Prisma.sql`
      SELECT "sploot_asset_embedding_visibility_backfill_remaining"() AS remaining
    `);
    expect(Number(afterSecond[0]?.remaining ?? 0)).toBe(0);

    const projection = await admin!.$queryRaw<Array<{ owner_user_id: string; asset_deleted_at: Date | null }>>(Prisma.sql`
      SELECT "owner_user_id", "asset_deleted_at"
      FROM "asset_embeddings"
      WHERE "asset_id" = ${assetIds[0]}
    `);
    expect(projection[0]).toEqual({ owner_user_id: userId, asset_deleted_at: null });
  });
});
