import { Prisma } from '@prisma/client';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { describe, expect, it } from 'vitest';
import { prisma, upsertAssetEmbedding } from '@/lib/db';
import { EMBEDDING_VECTOR_SQL_TYPE } from '@/lib/embedding-vector-sql';

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

function vector(length: number, value = 0.1): number[] {
  return Array.from({ length }, () => value);
}

describeWithDb('embedding dimension contract against pgvector', () => {
  it('has a live image_embedding column typed as vector(768)', async () => {
    const rows = await prisma.$queryRaw<Array<{ dimensions: number | null }>>(Prisma.sql`
      SELECT NULLIF(a.atttypmod, -1) AS dimensions
      FROM pg_attribute a
      INNER JOIN pg_class c ON c.oid = a.attrelid
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = 'asset_embeddings'
        AND a.attname = 'image_embedding'
        AND NOT a.attisdropped
    `);

    expect(rows).toEqual([{ dimensions: EMBEDDING_DIMENSION }]);
  });

  it('has the canonical cosine HNSW index on the 768-dimensional embedding column', async () => {
    const rows = await prisma.$queryRaw<Array<{
      index_name: string;
      table_name: string;
      access_method: string;
      column_name: string;
      opclass_name: string;
      options: string;
      definition: string;
    }>>(Prisma.sql`
      SELECT
        c.relname AS index_name,
        t.relname AS table_name,
        am.amname AS access_method,
        a.attname AS column_name,
        opc.opcname AS opclass_name,
        COALESCE(string_agg(option_name, ',' ORDER BY option_name), '') AS options,
        pg_get_indexdef(c.oid) AS definition
      FROM pg_class c
      INNER JOIN pg_index i ON i.indexrelid = c.oid
      INNER JOIN pg_class t ON t.oid = i.indrelid
      INNER JOIN pg_am am ON am.oid = c.relam
      INNER JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      INNER JOIN pg_opclass opc ON opc.oid = i.indclass[0]
      LEFT JOIN LATERAL unnest(COALESCE(c.reloptions, ARRAY[]::text[])) AS options(option_name) ON true
      WHERE c.relname = 'asset_embeddings_hnsw_idx'
        AND t.relname = 'asset_embeddings'
      GROUP BY c.oid, c.relname, t.relname, am.amname, a.attname, opc.opcname
    `);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      index_name: 'asset_embeddings_hnsw_idx',
      table_name: 'asset_embeddings',
      access_method: 'hnsw',
      column_name: 'image_embedding',
      opclass_name: 'vector_cosine_ops',
      options: 'ef_construction=128,m=24',
    });
    expect(rows[0]?.definition).toMatch(
      /^CREATE INDEX asset_embeddings_hnsw_idx ON (?:public\.)?asset_embeddings USING hnsw \(image_embedding vector_cosine_ops\) WITH \(m='?24'?, ?ef_construction='?128'?\)$/,
    );
  });

  it('makes pgvector reject a wrong-sized query vector loudly', async () => {
    const wrongSizedVector = vector(EMBEDDING_DIMENSION - 1);
    const vectorType = Prisma.raw(EMBEDDING_VECTOR_SQL_TYPE);

    await expect(
      prisma.$queryRaw(Prisma.sql`
        SELECT ARRAY[${Prisma.join(wrongSizedVector)}]::double precision[]::${vectorType} AS embedding
      `)
    ).rejects.toThrow(/dimension|expected|vector/i);
  });

  it('refuses a write vector that matches caller dim but not the shared dimension', async () => {
    await expect(
      upsertAssetEmbedding({
        assetId: 'dimension-contract-missing-asset',
        modelName: 'test-model',
        modelVersion: 'test-model',
        dim: EMBEDDING_DIMENSION - 1,
        embedding: vector(EMBEDDING_DIMENSION - 1),
      })
    ).rejects.toThrow(/768.*767/i);
  });
});
