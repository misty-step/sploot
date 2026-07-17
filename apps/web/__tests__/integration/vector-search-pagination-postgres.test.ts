import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { EMBEDDING_DIMENSION } from '@sploot/common';

import { createVectorSearchContext, encodeVectorSearchCursor, prisma, upsertAssetEmbedding, vectorSearch, vectorSearchPage } from '@/lib/db';

const describeWithDatabase = process.env.DATABASE_URL && prisma
  ? describe.sequential
  : describe.skip;

const userId = 'vector-search-pagination-user';
const foreignUserId = 'vector-search-pagination-foreign-user';
const assetIds = Array.from({ length: 25 }, (_, index) =>
  `${userId}-${index.toString().padStart(2, '0')}`
);
let laterMatchTagId: string;

describeWithDatabase('Postgres seeded vector-search pagination', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.test` },
    });
    await prisma.user.create({
      data: { id: foreignUserId, email: `${foreignUserId}@example.test` },
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
    await prisma.asset.createMany({
      data: Array.from({ length: 3000 }, (_, index) => ({
        id: `${foreignUserId}-${index.toString().padStart(4, '0')}`,
        ownerUserId: foreignUserId,
        blobUrl: `https://vector-search-pagination.public.blob.vercel-storage.com/foreign-${index}.png`,
        pathname: `foreign-${index}.png`,
        mime: 'image/png',
        size: index + 1,
        checksumSha256: `${foreignUserId}-${index}-checksum`,
      })),
    });
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "asset_embeddings" (
        "asset_id", "model_name", "model_version", "dim", "image_embedding",
        "status", "createdAt", "updatedAt"
      )
      SELECT
        ${foreignUserId} || '-' || lpad(n::text, 4, '0'),
        'pagination-foreign', 'v1', ${EMBEDDING_DIMENSION},
        ('[' || repeat('0.1,', 767) || '0.1]')::vector(768),
        'ready', NOW(), NOW()
      FROM generate_series(0, 2999) AS series(n)
    `);
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
        : [0.2, ...Array(EMBEDDING_DIMENSION - 1).fill(0.1)],
    })));
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.user.deleteMany({ where: { id: foreignUserId } });
  });

  it('keeps a tenant-complete bounded page when thousands of foreign vectors are closer', async () => {
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);
    const first = await vectorSearch(userId, query, { limit: 7 });
    const repeat = await vectorSearch(userId, query, { limit: 7 });
    const context = createVectorSearchContext({ query: 'foreign adversary', threshold: 0, limit: 7 });
    const pages = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
      const page = await vectorSearchPage(userId, query, {
        limit: 7,
        cursor,
        cursorContext: context,
      });
      pages.push(page);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const terminal = pages.at(-1);
    if (terminal && !terminal.nextCursor && terminal.results.length > 0) {
      const last = terminal.results.at(-1)!;
      cursor = encodeVectorSearchCursor({
        userId,
        order: 'relevance',
        id: last.id,
        rawDistance: last.rawDistance,
        context,
      });
      pages.push(await vectorSearchPage(userId, query, {
        limit: 7,
        cursor,
        cursorContext: context,
      }));
    }

    expect(first).toHaveLength(7);
    expect(first.map(({ id }) => id)).toEqual(repeat.map(({ id }) => id));
    expect(first.every(({ id }) => id.startsWith(`${userId}-`))).toBe(true);
    expect(first.some(({ id }) => id.startsWith(`${foreignUserId}-`))).toBe(false);
    expect(pages.map((page) => page.results.length)).toEqual([7, 7, 7, 4, 0]);
    expect(new Set(pages.flatMap((page) => page.results.map(({ id }) => id)))).toEqual(new Set(assetIds));
    expect(pages.some((page) => page.results.some(({ id }) => id.startsWith(`${foreignUserId}-`)))).toBe(false);
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

    // Adversarial DB-seam probe: normal clients stop when hasMore=false and
    // no nextCursor is returned; issue one explicit terminal cursor call to
    // prove the keyset boundary itself returns the later empty page.
    const lastPage = pages.at(-1);
    if (lastPage && !lastPage.nextCursor && lastPage.results.length > 0) {
      const last = lastPage.results.at(-1)!;
      cursor = encodeVectorSearchCursor({
        userId,
        order: 'relevance',
        id: last.id,
        rawDistance: last.rawDistance,
        context,
      });
      pages.push(await vectorSearchPage(userId, query, {
        limit: 7,
        cursor,
        cursorContext: context,
      }));
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

  it('resolves a sparse tail-tag page from the same-execution exhaustion signal, with no separate eligible-count query', async () => {
    // A sparse tag match (1 of 25) near the tail of the asset-id sort
    // order forces vectorSearchPage's candidate window to widen past the
    // small initial candidateLimit before it reaches the match. What the
    // fix removes is not the widening itself (finding a genuinely sparse
    // deep match still requires growing the window) but the *separate*
    // eligibleCount pre-query the old exhaustion check depended on, plus
    // any extra round-trip beyond the ranked-CTE scan each widening
    // already performs -- exhaustion is now read directly off the same
    // execution that returns the (possibly zero) matched rows.
    const queryRawSpy = vi.spyOn(prisma, '$queryRaw');
    const transactionSpy = vi.spyOn(prisma, '$transaction');
    const query = Array(EMBEDDING_DIMENSION).fill(0.1);

    const tagPage = await vectorSearchPage(userId, query, {
      limit: 5,
      tagId: laterMatchTagId,
      cursorContext: createVectorSearchContext({ query: 'sparse tagged tail', threshold: 0, tagId: laterMatchTagId, limit: 5 }),
    });

    // One $queryRaw for the page's own "total" count (unrelated to
    // candidate-window exhaustion) plus exactly one $transaction per
    // ranked-CTE widening attempt -- no separate eligible_count query ever
    // executes via $queryRaw beyond that single total-count call.
    const queryRawSqlTexts = queryRawSpy.mock.calls.map((call) => String((call[0] as { text?: string })?.text ?? call[0]));
    const scanCount = transactionSpy.mock.calls.length;
    queryRawSpy.mockRestore();
    transactionSpy.mockRestore();

    expect(tagPage.total).toBe(1);
    expect(tagPage.results.map(({ id }) => id)).toEqual([assetIds[22]]);
    expect(tagPage.hasMore).toBe(false);
    expect(scanCount).toBeGreaterThan(0);
    // A 25-item pool needs at most ceil(log2(25/6))+1 widenings to either
    // find the tail match or exhaust the pool outright; bound generously
    // above the observed worst case instead of pinning an exact count.
    expect(scanCount).toBeLessThanOrEqual(6);
    expect(queryRawSqlTexts.filter((sql) => sql.includes('eligible_count')).length).toBe(0);
  });
});
