import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs script without type declarations; the injected
// client keeps this test independent of a live database.
import { applyOnlineEmbeddingIndex } from '../../scripts/apply-online-embedding-index.mjs';

type QueryResult = { rows: Array<Record<string, boolean>> };

class FakeClient {
  queries: Array<{ sql: string; params?: string[] }> = [];
  private readonly responses: QueryResult[];

  constructor(responses: QueryResult[]) {
    this.responses = responses;
  }

  async connect() {}

  async query(sql: string, params?: string[]): Promise<QueryResult> {
    this.queries.push({ sql, params });
    return this.responses.shift() ?? { rows: [] };
  }

  async end() {}
}

describe('apply-online-embedding-index', () => {
  it('drops an interrupted invalid artifact and proves the rebuilt index is valid and ready', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: false, indisready: false }] },
      { rows: [] },
      { rows: [{ indisvalid: true, indisready: true }] },
      { rows: [{ indisvalid: true, indisready: true }] },
    ]);

    await applyOnlineEmbeddingIndex('postgresql://test/db', class {
      constructor() { return client; }
    });

    expect(client.queries.map(({ sql }) => sql)).toEqual([
      expect.stringContaining('FROM pg_index'),
      expect.stringContaining('DROP INDEX CONCURRENTLY'),
      expect.stringContaining('CREATE INDEX CONCURRENTLY'),
      expect.stringContaining('FROM pg_index'),
    ]);
  });

  it('does not rebuild a valid ready index', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: true, indisready: true }] },
      { rows: [{ indisvalid: true, indisready: true }] },
    ]);

    await applyOnlineEmbeddingIndex('postgresql://test/db', class {
      constructor() { return client; }
    });

    expect(client.queries).toHaveLength(2);
    expect(client.queries.some(({ sql }) => sql.includes('CREATE INDEX'))).toBe(false);
  });

  it('fails closed when the postcondition remains invalid', async () => {
    const client = new FakeClient([
      { rows: [] },
      { rows: [{ indisvalid: false, indisready: true }] },
    ]);

    await expect(applyOnlineEmbeddingIndex('postgresql://test/db', class {
      constructor() { return client; }
    })).rejects.toThrow(/valid and ready/);
  });
});
