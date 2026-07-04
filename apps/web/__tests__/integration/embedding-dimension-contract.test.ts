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
