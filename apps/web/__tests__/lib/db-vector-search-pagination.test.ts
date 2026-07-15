import { describe, expect, it } from 'vitest';
import { vectorSearchOrderClause } from '@/lib/db';

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
});
