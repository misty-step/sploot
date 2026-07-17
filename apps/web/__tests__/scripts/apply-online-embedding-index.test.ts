import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs script without type declarations; the injected
// client keeps this test independent of a live database.
import {
  applyOnlineEmbeddingIndex,
  applyOnlineHnswIndex,
  ONLINE_INDEX_LOCK_TIMEOUT,
  ONLINE_INDEX_STATEMENT_TIMEOUT,
  ONLINE_HNSW_INDEX_LOCK_TIMEOUT,
  ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT,
} from '../../scripts/apply-online-embedding-index.mjs';

type QueryResult = { rows: Array<Record<string, boolean | string | null>> };

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
  it('sets bounded timeouts on the connection that executes concurrent DDL', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: true, indisready: true }] },
      { rows: [{ indisvalid: true, indisready: true }] },
    ]);
    let config: Record<string, string> | undefined;

    await applyOnlineEmbeddingIndex('postgresql://test/db', class {
      constructor(value: Record<string, string>) {
        config = value;
        return client;
      }
    });

    expect(config).toEqual({
      connectionString: 'postgresql://test/db',
      options: `-c lock_timeout=${ONLINE_INDEX_LOCK_TIMEOUT} -c statement_timeout=${ONLINE_INDEX_STATEMENT_TIMEOUT}`,
    });
  });

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


describe('apply-online-hnsw-index', () => {
  it('sets an independent, generously-bounded timeout on the connection that builds the HNSW graph', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: true, indisready: true, indexdef: 'CREATE INDEX asset_embeddings_hnsw_idx ON asset_embeddings USING hnsw (image_embedding vector_cosine_ops) WITH (m=\'24\', ef_construction=\'128\')' }] },
    ]);
    let config: Record<string, string> | undefined;

    await applyOnlineHnswIndex('postgresql://test/db', class {
      constructor(value: Record<string, string>) {
        config = value;
        return client;
      }
    });

    expect(config).toEqual({
      connectionString: 'postgresql://test/db',
      options: `-c lock_timeout=${ONLINE_HNSW_INDEX_LOCK_TIMEOUT} -c statement_timeout=${ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT}`,
    });
    // The HNSW build must never inherit migrate-deploy's global 30s.
    expect(ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT).not.toBe('30s');
  });

  it('never DROPs or CREATEs when a valid, ready, contract-matching index already exists (read-only fast path)', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: true, indisready: true, indexdef: 'CREATE INDEX asset_embeddings_hnsw_idx ON asset_embeddings USING hnsw (image_embedding vector_cosine_ops) WITH (m=\'24\', ef_construction=\'128\')' }] },
    ]);

    await applyOnlineHnswIndex('postgresql://test/db', class {
      constructor() { return client; }
    });

    expect(client.queries).toHaveLength(1);
    expect(client.queries.some(({ sql }) => sql.includes('CREATE INDEX') || sql.includes('DROP INDEX'))).toBe(false);
  });

  it('drops an interrupted invalid artifact and rebuilds concurrently, proving valid/ready/contract-matching', async () => {
    const validDef = 'CREATE INDEX asset_embeddings_hnsw_idx ON asset_embeddings USING hnsw (image_embedding vector_cosine_ops) WITH (m=\'24\', ef_construction=\'128\')';
    const client = new FakeClient([
      { rows: [{ indisvalid: false, indisready: false, indexdef: validDef }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ indisvalid: true, indisready: true, indexdef: validDef }] },
    ]);

    await applyOnlineHnswIndex('postgresql://test/db', class {
      constructor() { return client; }
    });

    expect(client.queries.map(({ sql }) => sql)).toEqual([
      expect.stringContaining('FROM pg_index'),
      expect.stringContaining('DROP INDEX CONCURRENTLY'),
      expect.stringMatching(/CREATE INDEX CONCURRENTLY[\s\S]*USING hnsw/),
      expect.stringContaining('FROM pg_index'),
    ]);
  });

  it('fails closed instead of silently rebuilding when a same-name index exists but does not match the declared m/ef_construction contract', async () => {
    const client = new FakeClient([
      { rows: [{ indisvalid: true, indisready: true, indexdef: 'CREATE INDEX asset_embeddings_hnsw_idx ON asset_embeddings USING hnsw (image_embedding vector_cosine_ops) WITH (m=\'8\', ef_construction=\'32\')' }] },
    ]);

    await expect(applyOnlineHnswIndex('postgresql://test/db', class {
      constructor() { return client; }
    })).rejects.toThrow(/does not match the declared cosine HNSW contract/);

    expect(client.queries.some(({ sql }) => sql.includes('DROP INDEX') || sql.includes('CREATE INDEX'))).toBe(false);
  });

  it('fails closed when the postcondition remains invalid after the concurrent build', async () => {
    const client = new FakeClient([
      { rows: [] },
      { rows: [] },
      { rows: [{ indisvalid: false, indisready: true, indexdef: null }] },
    ]);

    await expect(applyOnlineHnswIndex('postgresql://test/db', class {
      constructor() { return client; }
    })).rejects.toThrow(/valid, ready, contract-matching/);
  });
});
