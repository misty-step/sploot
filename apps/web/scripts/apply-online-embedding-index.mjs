#!/usr/bin/env node

import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Client } = pg;
const INDEX_NAME = 'asset_embeddings_pending_next_attempt_idx';

export async function applyOnlineEmbeddingIndex(databaseUrl = process.env.DATABASE_URL, ClientConstructor = Client) {
  if (!databaseUrl) {
    throw new Error('[online-migrations] DATABASE_URL is required');
  }

  const client = new ClientConstructor({ connectionString: databaseUrl });
  await client.connect();
  try {
    const existing = await client.query(`
      SELECT indexrelid::regclass AS name, indisvalid, indisready
      FROM pg_index
      WHERE indexrelid = to_regclass($1)
    `, [INDEX_NAME]);
    const row = existing.rows[0];
    if (row && (!row.indisvalid || !row.indisready)) {
      // An interrupted CONCURRENTLY build leaves an invalid, same-name
      // artifact. It must be removed concurrently before the retry.
      await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
    }

    if (!row || !row.indisvalid || !row.indisready) {
      await client.query(`
        CREATE INDEX CONCURRENTLY "${INDEX_NAME}"
          ON "asset_embeddings"("status", "next_attempt_at", "createdAt")
          WHERE "status" = 'pending' AND "terminal_at" IS NULL
      `);
    }

    const accepted = await client.query(`
      SELECT indisvalid, indisready
      FROM pg_index
      WHERE indexrelid = to_regclass($1)
    `, [INDEX_NAME]);
    const finalRow = accepted.rows[0];
    if (!finalRow?.indisvalid || !finalRow.indisready) {
      throw new Error('[online-migrations] pending embedding index did not reach valid and ready state');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await applyOnlineEmbeddingIndex();
}
