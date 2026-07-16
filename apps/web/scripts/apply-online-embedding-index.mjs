#!/usr/bin/env node

import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Client } = pg;
const INDEX_NAME = 'asset_embeddings_pending_next_attempt_idx';
export const ONLINE_INDEX_LOCK_TIMEOUT = '5s';
export const ONLINE_INDEX_STATEMENT_TIMEOUT = '30s';

function boundedTimeout(value, fallback) {
  return /^\d+(?:\.\d+)?s$/.test(value ?? '') ? value : fallback;
}

export async function applyOnlineEmbeddingIndex(databaseUrl = process.env.DATABASE_URL, ClientConstructor = Client) {
  if (!databaseUrl) {
    throw new Error('[online-migrations] DATABASE_URL is required');
  }

  // This is a separate autocommit connection because CREATE INDEX CONCURRENTLY
  // cannot run inside a transaction. Keep the safety bounds on the connection
  // that actually executes the online DDL; PGOPTIONS on migrate-deploy's
  // Prisma child cannot constrain this independently spawned client.
  const client = new ClientConstructor({
    connectionString: databaseUrl,
    options: `-c lock_timeout=${boundedTimeout(process.env.EMBEDDING_INDEX_LOCK_TIMEOUT, ONLINE_INDEX_LOCK_TIMEOUT)} -c statement_timeout=${boundedTimeout(process.env.EMBEDDING_INDEX_STATEMENT_TIMEOUT, ONLINE_INDEX_STATEMENT_TIMEOUT)}`,
  });
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
