import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@sploot/common';

import { createVectorSearchContext, prisma, upsertAssetEmbedding, vectorSearchPage } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const userId = 'vector-search-pagination-user';
const assetIds = Array.from({ length: 25 }, (_, index) =>
  `vector-search-pagination-${index.toString().padStart(2, '0')}`
);
let laterMatchTagId: string;

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
        favorite: index === 19,
      })),
    });
    const tag = await prisma.tag.create({
      data: { ownerUserId: userId, name: 'later-match' },
    });
    laterMatchTagId = tag.id;
    await prisma.assetTag.create({
      data: { assetId: assetIds[22], tagId: tag.id },
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

  it('returns deterministic, complete, non-overlapping relevance pages', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const first = await vectorSearchPage(userId, query, {
      limit: 10,
      offset: 0,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 10 }),
    });
    const second = await vectorSearchPage(userId, query, {
      limit: 10,
      offset: 10,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 10 }),
    });
    const third = await vectorSearchPage(userId, query, {
      limit: 10,
      offset: 20,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 10 }),
    });
    const repeat = await vectorSearchPage(userId, query, {
      limit: 10,
      offset: 0,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 10 }),
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

  it('filters favorites and tags in SQL before page limits and total counts', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const unfilteredFirstPage = await vectorSearchPage(userId, query, {
      limit: 1,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 1 }),
    });
    const favoritePage = await vectorSearchPage(userId, query, {
      limit: 1,
      favoriteOnly: true,
      cursorContext: createVectorSearchContext({ query: 'favorites', threshold: 0, favoriteOnly: true, limit: 1 }),
    });
    const tagPage = await vectorSearchPage(userId, query, {
      limit: 1,
      tagId: laterMatchTagId,
      cursorContext: createVectorSearchContext({ query: 'tagged', threshold: 0, tagId: laterMatchTagId, limit: 1 }),
    });

    expect(favoritePage.total).toBe(1);
    expect(unfilteredFirstPage.results.map(({ id }) => id)).not.toContain(assetIds[19]);
    expect(favoritePage.results.map(({ id }) => id)).toEqual([assetIds[19]]);
    expect(tagPage.total).toBe(1);
    expect(tagPage.results.map(({ id }) => id)).toEqual([assetIds[22]]);
  });
});
