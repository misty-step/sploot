import { afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { prisma } from '@/lib/db';
import {
  executeAdvancedSearchQuery,
  type AdvancedSearchQueryInput,
} from '@/lib/search/advanced-search-query';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('advanced search production query against isolated pgvector rows', () => {
  const ownerId = `advanced-sql-owner-${randomUUID()}`;
  const tagId = `advanced-sql-tag-${randomUUID()}`;
  const assetIds = [
    `advanced-sql-asset-a-${randomUUID()}`,
    `advanced-sql-asset-b-${randomUUID()}`,
    `advanced-sql-asset-c-${randomUUID()}`,
  ];

  afterEach(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('executes the route-owned query with filters, ordering, pagination, projection, and bigint totals', async () => {
    if (!prisma) throw new Error('DATABASE_URL is required for pgvector execution test');

    await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@sploot.test` } });
    await prisma.tag.create({
      data: { id: tagId, ownerUserId: ownerId, name: 'contract-filter' },
    });

    const createdAt = [
      new Date('2026-07-01T12:00:00.000Z'),
      new Date('2026-07-02T12:00:00.000Z'),
      new Date('2026-07-03T12:00:00.000Z'),
    ];
    await prisma.asset.createMany({
      data: assetIds.map((id, index) => ({
        id,
        ownerUserId: ownerId,
        blobUrl: `https://sploot-test.public.blob.vercel-storage.com/${id}.png`,
        thumbnailUrl: `https://sploot-test.public.blob.vercel-storage.com/${id}-thumb.png`,
        pathname: `memes/${id}.png`,
        mime: index === 2 ? 'image/jpeg' : 'image/png',
        size: 1024 + index,
        width: 320 + index * 100,
        height: 240 + index * 100,
        favorite: index !== 1,
        checksumSha256: `${id}-checksum`,
        createdAt: createdAt[index],
        updatedAt: createdAt[index],
      })),
    });
    await prisma.assetTag.create({ data: { assetId: assetIds[0], tagId } });

    const vectors = [
      [1, 0],
      [0.8, 0.6],
      [0, 1],
    ];
    for (const [index, [first, second]] of vectors.entries()) {
      const vector = new Array(EMBEDDING_DIMENSION).fill(0);
      vector[0] = first;
      vector[1] = second;
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "asset_embeddings"
          ("asset_id", "model_name", "model_version", "dim", "image_embedding", "status", "updatedAt")
        VALUES
          (${assetIds[index]}, 'test/clip', 'production-query-contract', ${EMBEDDING_DIMENSION},
           ${`[${vector.join(',')}]`}::vector, 'ready', CURRENT_TIMESTAMP)
      `);
    }

    const query: AdvancedSearchQueryInput = {
      userId: ownerId,
      embedding: [1, ...new Array(EMBEDDING_DIMENSION - 1).fill(0)],
      filters: {
        mimeTypes: ['image/png'],
        tags: ['contract-filter'],
        minWidth: 300,
        minHeight: 200,
        dateFrom: '2026-07-01',
        dateTo: '2026-07-03T23:59:59.000Z',
      },
      threshold: -0.1,
      limit: 2,
      offset: 0,
      sortBy: 'date',
    };

    const filtered = await executeAdvancedSearchQuery(prisma, query);
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.totalCount).toBe(1);
    expect(filtered.rows[0]).toMatchObject({
      id: assetIds[0],
      blob_url: expect.stringContaining(assetIds[0]),
      thumbnail_url: expect.stringContaining(`${assetIds[0]}-thumb`),
      mime: 'image/png',
      width: 320,
      height: 240,
      favorite: true,
      similarity: expect.closeTo(1),
    });
    expect(filtered.rows[0].created_at).toBeInstanceOf(Date);
    expect(filtered.rows[0]).not.toHaveProperty('updated_at');
    expect(filtered.rows[0].total_count).toBe(BigInt(1));

    const paged = await executeAdvancedSearchQuery(prisma, {
      ...query,
      filters: { mimeTypes: ['image/png'] },
      limit: 1,
      offset: 1,
      sortBy: 'relevance',
    });
    expect(paged.rows).toHaveLength(1);
    expect(paged.rows[0].id).toBe(assetIds[1]);
    expect(paged.totalCount).toBe(2);

    const favorites = await executeAdvancedSearchQuery(prisma, {
      ...query,
      filters: { favorites: true },
      limit: 10,
      offset: 0,
      sortBy: 'favorite',
    });
    expect(favorites.rows.map((row) => row.id)).toEqual([assetIds[0], assetIds[2]]);
    expect(favorites.rows.every((row) => row.favorite)).toBe(true);
  });
});
