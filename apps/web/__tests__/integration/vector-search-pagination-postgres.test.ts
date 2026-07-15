import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@sploot/common';

import { createVectorSearchContext, prisma, upsertAssetEmbedding, vectorSearch, vectorSearchPage } from '@/lib/db';

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
    await Promise.all(assetIds.map((assetId, index) => upsertAssetEmbedding({
      assetId,
      modelName: 'pagination-test',
      modelVersion: 'v1',
      dim: EMBEDDING_DIMENSION,
      embedding: index === assetIds.length - 1
        ? [1, ...Array(EMBEDDING_DIMENSION - 1).fill(0)]
        : Array(EMBEDDING_DIMENSION).fill(0.1),
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

  it('traverses tied relevance scores with a cursor and preserves the terminal empty page', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const context = createVectorSearchContext({ query: 'tied assets', threshold: 0, limit: 7 });
    const pages = [];
    let cursor: string | undefined;

    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const page = await vectorSearchPage(userId, query, {
        limit: 7,
        cursor,
        cursorContext: context,
      });
      pages.push(page);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(pages).toHaveLength(5);
    expect(pages.slice(0, 3).map((page) => page.results.length)).toEqual([7, 7, 7]);
    expect(pages[3].results).toHaveLength(4);
    expect(pages[4].results).toEqual([]);
    expect(pages[4].hasMore).toBe(false);
    expect(new Set(pages.flatMap((page) => page.results.map(({ id }) => id))).size).toBe(assetIds.length);
  });

  it('applies threshold variance before paging and reports empty later pages honestly', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const highThreshold = 0.99;
    const context = createVectorSearchContext({ query: 'threshold variance', threshold: highThreshold, limit: 10 });
    const first = await vectorSearchPage(userId, query, {
      limit: 10,
      threshold: highThreshold,
      offset: 0,
      cursorContext: context,
    });
    const later = await vectorSearchPage(userId, query, {
      limit: 10,
      threshold: highThreshold,
      offset: assetIds.length,
      cursorContext: context,
    });
    const all = await vectorSearchPage(userId, query, {
      limit: 100,
      threshold: 0,
      cursorContext: createVectorSearchContext({ query: 'all assets', threshold: 0, limit: 100 }),
    });

    expect(first.total).toBe(assetIds.length - 1);
    expect(first.results).toHaveLength(10);
    expect(first.results.map(({ id }) => id)).not.toContain(assetIds.at(-1));
    expect(later.results).toEqual([]);
    expect(later.hasMore).toBe(false);
    expect(all.total).toBe(assetIds.length);
  });

  it('keeps the direct pgvector threshold path complete without a capped post-filter', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const results = await vectorSearch(userId, query, { limit: 5, threshold: 0.99 });

    expect(results).toHaveLength(5);
    expect(results.every(({ distance }) => distance >= 0.99)).toBe(true);
  });
});
