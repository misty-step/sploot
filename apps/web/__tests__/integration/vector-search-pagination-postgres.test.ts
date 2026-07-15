import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@sploot/common';

import { prisma, upsertAssetEmbedding, vectorSearchPage } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const userId = 'vector-search-pagination-user';
const assetIds = Array.from({ length: 25 }, (_, index) =>
  `vector-search-pagination-${index.toString().padStart(2, '0')}`
);

describeWithDatabase('Postgres seeded vector-search pagination', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.test` },
    });
    await prisma.asset.createMany({
      data: assetIds.map((id, index) => ({
        id,
        ownerUserId: userId,
        blobUrl: `https://vector-search-pagination.public.blob.vercel-storage.com/${id}.png`,
        pathname: `${id}.png`,
        mime: 'image/png',
        size: index + 1,
        checksumSha256: `${id}-checksum`,
      })),
    });
    await Promise.all(assetIds.map((assetId) => upsertAssetEmbedding({
      assetId,
      modelName: 'pagination-test',
      modelVersion: 'v1',
      dim: EMBEDDING_DIMENSION,
      embedding: Array(EMBEDDING_DIMENSION).fill(0.1),
    })));
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('returns deterministic, complete, non-overlapping bounded pages', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const first = await vectorSearchPage(userId, query, {
      shuffleSeed: 4242,
      limit: 10,
      offset: 0,
    });
    const second = await vectorSearchPage(userId, query, {
      shuffleSeed: 4242,
      limit: 10,
      offset: 10,
    });
    const third = await vectorSearchPage(userId, query, {
      shuffleSeed: 4242,
      limit: 10,
      offset: 20,
    });
    const repeat = await vectorSearchPage(userId, query, {
      shuffleSeed: 4242,
      limit: 10,
      offset: 0,
    });

    expect(first.total).toBe(assetIds.length);
    expect(second.total).toBe(assetIds.length);
    expect(third.total).toBe(assetIds.length);
    expect(first.results).toHaveLength(10);
    expect(second.results).toHaveLength(10);
    expect(third.results).toHaveLength(5);
    expect(first.results.map(({ id }) => id)).toEqual(repeat.results.map(({ id }) => id));
    expect(new Set([
      ...first.results.map(({ id }) => id),
      ...second.results.map(({ id }) => id),
      ...third.results.map(({ id }) => id),
    ]).size).toBe(assetIds.length);
  });
});
