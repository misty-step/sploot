import { Prisma } from '@prisma/client';
import { EMBEDDING_DIMENSION } from '@sploot/common';

export const EMBEDDING_VECTOR_SQL_TYPE = `vector(${EMBEDDING_DIMENSION})`;

export function assertEmbeddingDimension(
  embedding: number[],
  context = 'embedding'
): void {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`${context} must be a non-empty array`);
  }

  if (!embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`${context} must contain only finite numbers`);
  }

  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `${context} expected ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`
    );
  }
}

export function embeddingVectorSql(
  embedding: number[],
  context = 'embedding'
): Prisma.Sql {
  assertEmbeddingDimension(embedding, context);
  const vectorTypeSql = Prisma.raw(EMBEDDING_VECTOR_SQL_TYPE);
  return Prisma.sql`ARRAY[${Prisma.join(embedding)}]::double precision[]::${vectorTypeSql}`;
}
