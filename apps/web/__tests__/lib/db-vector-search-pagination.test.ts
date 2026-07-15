import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import {
  buildVectorSearchPageQuery,
  buildUnfilteredVectorSearchQuery,
  createVectorSearchContext,
  decodeVectorSearchCursor,
  encodeVectorSearchCursor,
  vectorSearchCursorMatchesContext,
  vectorSearchFilterClause,
  vectorSearchFilterVariant,
  vectorSearchOrderClause,
  vectorSearchPage,
} from '@/lib/db';

describe('seeded vector-search pagination', () => {
  const userId = 'similar-assets-user';

  it('keeps semantic search ordered by vector relevance', () => {
    const clause = vectorSearchOrderClause();

    expect(clause.strings.join('?')).toMatch(
      /ORDER BY ranked\.distance DESC, ranked\.id ASC/
    );
    expect(clause.values).toEqual([]);
  });

  it('keeps relevance ordering when no shuffle seed is requested', () => {
    const clause = vectorSearchOrderClause();

    expect(clause.strings.join('?')).toContain(
      'ORDER BY ranked.distance DESC, ranked.id ASC'
    );
    expect(clause.values).toEqual([]);
  });

  it('selects explicit SQL filter variants without nullable optional predicates', () => {
    expect(vectorSearchFilterVariant({})).toBe('unfiltered');
    expect(vectorSearchFilterVariant({ favoriteOnly: true })).toBe('favorite');
    expect(vectorSearchFilterVariant({ tagId: 'tag-cats' })).toBe('tag');
    expect(vectorSearchFilterVariant({ favoriteOnly: true, tagId: 'tag-cats' })).toBe('favorite+tag');

    const unfilteredSql = vectorSearchFilterClause('unfiltered', null).strings.join(' ');
    expect(unfilteredSql).not.toContain('favorite');
    expect(unfilteredSql).not.toContain('asset_tags');

    const favoriteSql = vectorSearchFilterClause('favorite', null).strings.join(' ');
    expect(favoriteSql).toContain('a.favorite = true');
    expect(favoriteSql).not.toContain('asset_tags');

    const tagSql = vectorSearchFilterClause('tag', 'tag-cats').strings.join(' ');
    expect(tagSql).toContain('asset_tags');
    expect(tagSql).toContain('at.tag_id =');

    const combinedSql = vectorSearchFilterClause('favorite+tag', 'tag-cats').strings.join(' ');
    expect(combinedSql).toContain('a.favorite = true');
    expect(combinedSql).toContain('asset_tags');
  });

  it('keeps the unfiltered eval query HNSW-orderable at the ranked scan boundary', () => {
    const query = buildUnfilteredVectorSearchQuery(
      'eval-user',
      Array(EMBEDDING_DIMENSION).fill(0.1),
      120,
    );
    const sql = query.strings.join(' ');

    expect(sql).toContain('WITH ranked AS MATERIALIZED');
    expect(sql).toContain('FROM "asset_embeddings" ae');
    expect(sql).toContain('ORDER BY ae.image_embedding <=>');
    expect(sql).toContain('ae.asset_id ASC');
    expect(sql).toContain('1 - ranked.distance AS distance');
    expect(sql).toContain('FROM ranked');
    expect(sql).toContain('LIMIT');
    expect(sql).not.toContain('COUNT');
    expect(sql).not.toContain('asset_tags');
    expect(sql).not.toContain('AND a.favorite');
  });

  it('keeps thresholded direct searches complete outside the HNSW-ranked CTE', () => {
    const query = buildUnfilteredVectorSearchQuery(
      'similar-assets-user',
      Array(EMBEDDING_DIMENSION).fill(0.1),
      12,
    );
    const sql = query.strings.join(' ');

    expect(sql).toContain('ORDER BY ae.image_embedding <=>');
    expect(sql).toContain('ae.asset_id ASC');
    expect(sql).toContain('a.id ASC');
    expect(sql).toContain("ae.status = 'ready'");
    expect(sql).toContain('1 - ranked.distance AS distance');
    expect(sql).not.toContain('COUNT');
  });

  it('asserts the paged SQL owner, ready-state, threshold, and tie contracts directly', () => {
    const query = buildVectorSearchPageQuery(
      'paged-user',
      Array(EMBEDDING_DIMENSION).fill(0.1),
      {
        limit: 7,
        threshold: 0.2,
        favoriteOnly: false,
        tagId: null,
        offset: 0,
        cursor: null,
      },
    );
    const sql = query.strings.join(' ');

    expect(sql).toContain('a.owner_user_id =');
    expect(sql).toContain("ae.status = 'ready'");
    expect(sql).toContain('1 - ranked.distance >=');
    expect(sql).toContain('>=');
    expect(sql).toContain('ORDER BY ranked.distance ASC');
    expect(sql).toContain('a.id ASC');
  });

  it('binds a cursor to the raw-distance boundary while retaining deterministic asset ties', () => {
    const context = createVectorSearchContext({ query: 'cursor', threshold: 0, limit: 7 });
    const cursor = encodeVectorSearchCursor({
      userId,
      order: 'relevance',
      id: 'asset-7',
      distance: 0.9,
      context,
    });
    const decoded = decodeVectorSearchCursor(cursor, userId);
    expect(decoded).not.toBeNull();

    const query = buildVectorSearchPageQuery(userId, Array(EMBEDDING_DIMENSION).fill(0.1), {
      limit: 7,
      favoriteOnly: false,
      tagId: null,
      offset: 0,
      cursor: decoded,
      candidateLimit: 8,
    });
    const sql = query.strings.join(' ');
    expect(sql).toContain('ae.image_embedding <=>');
    expect(sql).toContain('ae.asset_id >');
    expect(sql).toContain('ORDER BY ae.image_embedding <=>');
    expect(sql).toContain('ORDER BY ranked.distance ASC, a.id ASC');
  });

  it('encodes a canonical search-context-bound cursor without exposing pagination offsets', () => {
    const context = createVectorSearchContext({
      query: 'cats in hats',
      threshold: 0.2,
      favoriteOnly: true,
      tagId: 'tag-cats',
      limit: 10,
    });
    const cursor = encodeVectorSearchCursor({
      userId,
      order: 'relevance',
      id: 'asset-42',
      distance: 0.91,
      context,
    });

    expect(decodeVectorSearchCursor(cursor)).toEqual({
      version: 3,
      userId,
      order: 'relevance',
      id: 'asset-42',
      distance: 0.91,
      context,
    });
    expect(decodeVectorSearchCursor('not-a-cursor')).toBeNull();
    expect(decodeVectorSearchCursor(cursor, 'another-user')).toBeNull();
    expect(decodeVectorSearchCursor(`${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`)).toBeNull();
  });

  it('normalizes query and tag context before binding a cursor', () => {
    expect(createVectorSearchContext({
      query: '  Cats   in hats ',
      threshold: 0.2,
      tagId: '  tag-cats  ',
      limit: 10,
    })).toEqual(createVectorSearchContext({
      query: 'cats in hats',
      threshold: 0.2,
      tagId: 'tag-cats',
      limit: 10,
    }));
  });

  it('round-trips a cursor for the maximum valid query size', () => {
    const context = createVectorSearchContext({
      query: '🙂'.repeat(250),
      threshold: 0.2,
      limit: 10,
    });
    const cursor = encodeVectorSearchCursor({
      userId,
      order: 'relevance',
      id: 'asset-42',
      distance: 0.91,
      context,
    });

    expect(cursor.length).toBeGreaterThan(512);
    expect(decodeVectorSearchCursor(cursor)).toEqual({ version: 3, userId, order: 'relevance', id: 'asset-42', distance: 0.91, context });
  });

  it.each([
    ['query', { query: 'dogs' }],
    ['threshold', { threshold: 0.3 }],
    ['favorite filter', { favoriteOnly: true }],
    ['tag filter', { tagId: 'tag-dogs' }],
    ['page size', { limit: 20 }],
  ])('does not treat a changed %s as the same result context', (_dimension, change) => {
    const original = createVectorSearchContext({ query: 'cats', threshold: 0.2, limit: 10 });
    const changed = createVectorSearchContext({ ...original, ...change });

    expect(vectorSearchCursorMatchesContext({
      version: 3,
      userId,
      order: 'relevance',
      id: 'asset-1',
      distance: 0.9,
      context: original,
    }, changed, userId)).toBe(false);

    expect(vectorSearchCursorMatchesContext({
      version: 3,
      userId,
      order: 'relevance',
      id: 'asset-1',
      distance: 0.9,
      context: original,
    }, original, 'another-user')).toBe(false);
  });

  it('rejects a cursor when the canonical query context changes before database execution', async () => {
    const cursor = encodeVectorSearchCursor({
      userId: 'user-1',
      order: 'relevance',
      id: 'asset-1',
      distance: 0.9,
      context: createVectorSearchContext({ query: 'cats', threshold: 0.2, limit: 1 }),
    });

    await expect(vectorSearchPage('user-1', [0.1], {
      limit: 1,
      cursor,
      cursorContext: createVectorSearchContext({ query: 'dogs', threshold: 0.2, limit: 1 }),
    })).rejects.toThrow('Search cursor does not match search context');
  });

  it('rejects an unbounded page before touching the database', async () => {
    await expect(vectorSearchPage('user-1', [0.1], { limit: 101 })).rejects.toThrow(/between 1 and 100/);
    await expect(vectorSearchPage('user-1', [0.1], { offset: 501 })).rejects.toThrow(/use a cursor/);
  });
});
