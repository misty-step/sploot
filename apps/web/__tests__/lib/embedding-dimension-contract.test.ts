import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSION } from '@sploot/common';
import { EMBEDDING_VECTOR_SQL_TYPE, assertEmbeddingDimension } from '@/lib/embedding-vector-sql';

const WEB_ROOT = process.cwd();

describe('embedding dimension contract', () => {
  it('keeps the model dimension in one shared constant', () => {
    expect(EMBEDDING_DIMENSION).toBe(768);
    expect(EMBEDDING_VECTOR_SQL_TYPE).toBe('vector(768)');
  });

  it('rejects vectors that do not match the shared dimension', () => {
    expect(() =>
      assertEmbeddingDimension(new Array(EMBEDDING_DIMENSION - 1).fill(0), 'query embedding')
    ).toThrow(/query embedding.*768.*767/i);
  });

  it('declares the current vector dimension in Prisma schema and corrective migration', async () => {
    const schema = await readFile(join(WEB_ROOT, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain(`imageEmbedding  Unsupported("vector(${EMBEDDING_DIMENSION})")?`);

    const migrationsDir = join(WEB_ROOT, 'prisma/migrations');
    const migrationNames = await readdir(migrationsDir);
    const correctiveMigration = migrationNames.find((name) =>
      name.includes('fix_embedding_vector_dimension')
    );
    expect(correctiveMigration).toBeTruthy();

    const migrationSql = await readFile(
      join(migrationsDir, correctiveMigration!, 'migration.sql'),
      'utf8'
    );
    expect(migrationSql).toContain(`TYPE vector(${EMBEDDING_DIMENSION})`);
    expect(migrationSql).toContain(`"image_embedding"::vector(${EMBEDDING_DIMENSION})`);
    expect(migrationSql).toContain(`current_dimensions <> ${EMBEDDING_DIMENSION}`);
    expect(migrationSql).toContain('Cannot automatically convert % existing image embeddings');
    expect(migrationSql).toContain('20260610195422_add_text_embedding_cache');
  });

  it('keeps executable vector casts dimension typed', async () => {
    const files = [
      'lib/db.ts',
      'app/api/search/advanced/route.ts',
      'scripts/qa-seed.ts',
    ];

    for (const file of files) {
      const source = await readFile(join(WEB_ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/::vector(?!\()/);
    }
  });
});
