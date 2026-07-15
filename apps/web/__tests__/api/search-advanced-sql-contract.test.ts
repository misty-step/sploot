import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { executeAdvancedSearchQuery } from '@/lib/search/advanced-search-query';

describe('advanced search production query contract', () => {
  it('executes one parameterized projection containing the route filters and controls', async () => {
    let queryText = '';
    const client = {
      $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
        queryText = query.sql;
        return [] as T;
      },
    };

    await executeAdvancedSearchQuery(client, {
      userId: 'user-1',
      embedding: [1, ...new Array(767).fill(0)],
      filters: {
        favorites: true,
        mimeTypes: ['image/png'],
        tags: ['reaction'],
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        minWidth: 320,
        minHeight: 240,
      },
      threshold: 0.2,
      limit: 7,
      offset: 3,
      sortBy: 'date',
    });

    expect(queryText).toContain('a."createdAt" AS created_at');
    expect(queryText).not.toContain('updated_at');
    expect(queryText).toContain('a.thumbnail_url');
    expect(queryText).toContain('COUNT(*) OVER() AS total_count');
    expect(queryText).toContain("ae.status = 'ready'");
    expect(queryText).toContain('ae.image_embedding IS NOT NULL');
    expect(queryText).toContain('>=');
    expect(queryText).toContain('a.favorite = true');
    expect(queryText).toContain('a.mime = ANY');
    expect(queryText).toContain('filtered_tags.name IN');
    expect(queryText).toContain('ORDER BY a."createdAt" DESC');
    expect(queryText).toContain('LIMIT');
    expect(queryText).toContain('OFFSET');
    expect(queryText).not.toContain('a.created_at');
    expect(queryText).not.toContain('a.updated_at');
  });
});
