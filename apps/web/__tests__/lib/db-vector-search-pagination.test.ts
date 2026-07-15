import { describe, expect, it } from 'vitest';
import {
  decodeVectorSearchCursor,
  encodeVectorSearchCursor,
  vectorSearchOrderClause,
  vectorSearchPage,
} from '@/lib/db';

describe('seeded vector-search pagination', () => {
  it('builds one stable total order in Postgres for a seeded page', () => {
    const clause = vectorSearchOrderClause(4242);

    expect(clause.strings.join('?')).toMatch(
      /ORDER BY md5\(ranked\.id \|\| ':' \|\| \?\), ranked\.id ASC/
    );
    expect(clause.values).toEqual(['4242']);
  });

  it('keeps relevance ordering when no shuffle seed is requested', () => {
    const clause = vectorSearchOrderClause();

    expect(clause.strings.join('?')).toContain(
      'ORDER BY ranked.distance DESC, ranked.id ASC'
    );
    expect(clause.values).toEqual([]);
  });

  it('encodes an order-bound cursor without exposing pagination offsets', () => {
    const cursor = encodeVectorSearchCursor({
      order: 'shuffle',
      id: 'asset-42',
      shuffleKey: 'a'.repeat(32),
      shuffleSeed: 4242,
    });

    expect(decodeVectorSearchCursor(cursor)).toEqual({
      version: 1,
      order: 'shuffle',
      id: 'asset-42',
      shuffleKey: 'a'.repeat(32),
      shuffleSeed: 4242,
    });
    expect(decodeVectorSearchCursor('not-a-cursor')).toBeNull();
  });

  it('rejects an unbounded page before touching the database', async () => {
    await expect(vectorSearchPage('user-1', [0.1], { limit: 101 })).rejects.toThrow(/between 1 and 100/);
    await expect(vectorSearchPage('user-1', [0.1], { offset: 501 })).rejects.toThrow(/use a cursor/);
  });
});
