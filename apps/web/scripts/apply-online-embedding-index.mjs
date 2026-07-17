#!/usr/bin/env node

import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Client } = pg;
const INDEX_NAME = 'asset_embeddings_pending_next_attempt_idx';
export const ONLINE_INDEX_LOCK_TIMEOUT = '5s';
export const ONLINE_INDEX_STATEMENT_TIMEOUT = '30s';

const HNSW_INDEX_NAME = 'asset_embeddings_hnsw_idx';
// HNSW graph builds scan and link every row in the table -- unlike a
// partial btree index, there is no way to bound this to seconds on a
// production-sized asset_embeddings table. Keep the connect-time lock
// bound tight (CONCURRENTLY only needs brief locks at start/end) but give
// the build itself a generous, still-bounded ceiling so a genuinely wedged
// build fails the deploy instead of hanging it forever.
export const ONLINE_HNSW_INDEX_LOCK_TIMEOUT = '5s';
export const ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT = '1800s';

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

/**
 * Restore the cosine HNSW access path on asset_embeddings.image_embedding
 * (vector(768), m=24, ef_construction=128) via CREATE INDEX CONCURRENTLY on
 * an independent autocommit connection -- the migrate-deploy Prisma child's
 * PGOPTIONS statement_timeout=30s cannot bound an HNSW build on a
 * production-sized table, and CONCURRENTLY itself cannot run inside the
 * transaction migrate-deploy's regular migrations execute in. This runs as
 * its own post-Prisma-migrate stage; canonical migration
 * 20260717010000_restore_asset_embeddings_hnsw_index is deliberately a
 * no-op marker, matching the pending_next_attempt index precedent above.
 */
const HNSW_DEFINITION_PATTERN = /USING hnsw \(image_embedding vector_cosine_ops\)/;
const HNSW_M_PATTERN = /m='?24'?/;
const HNSW_EF_CONSTRUCTION_PATTERN = /ef_construction='?128'?/;

function hnswDefinitionMatches(indexdef) {
  return typeof indexdef === 'string'
    && HNSW_DEFINITION_PATTERN.test(indexdef)
    && HNSW_M_PATTERN.test(indexdef)
    && HNSW_EF_CONSTRUCTION_PATTERN.test(indexdef);
}

export async function applyOnlineHnswIndex(databaseUrl = process.env.DATABASE_URL, ClientConstructor = Client) {
  if (!databaseUrl) {
    throw new Error('[online-migrations] DATABASE_URL is required');
  }

  const client = new ClientConstructor({
    connectionString: databaseUrl,
    options: `-c lock_timeout=${boundedTimeout(process.env.EMBEDDING_HNSW_INDEX_LOCK_TIMEOUT, ONLINE_HNSW_INDEX_LOCK_TIMEOUT)} -c statement_timeout=${boundedTimeout(process.env.EMBEDDING_HNSW_INDEX_STATEMENT_TIMEOUT, ONLINE_HNSW_INDEX_STATEMENT_TIMEOUT)}`,
  });
  await client.connect();
  try {
    const existing = await client.query(`
      SELECT indexrelid::regclass AS name, indisvalid, indisready, pg_get_indexdef(indexrelid) AS indexdef
      FROM pg_index
      WHERE indexrelid = to_regclass($1)
    `, [HNSW_INDEX_NAME]);
    const row = existing.rows[0];
    const rowIsCorrect = Boolean(row) && row.indisvalid && row.indisready && hnswDefinitionMatches(row.indexdef);

    // Read-only fast path: the production-sized HNSW graph is already valid,
    // ready, and matches the declared m=24/ef_construction=128 cosine
    // contract. Never DROP/CREATE a good index on every deploy -- only
    // repair a genuinely missing, invalid/not-ready, or wrong-definition
    // artifact.
    if (rowIsCorrect) return;

    if (row) {
      if (!row.indisvalid || !row.indisready) {
        // An interrupted CONCURRENTLY build leaves an invalid, same-name
        // artifact. It must be removed concurrently before the retry.
        await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${HNSW_INDEX_NAME}"`);
      } else {
        // A same-name index exists, is valid and ready, but does not match
        // the declared contract (m/ef_construction/opclass). Do not
        // silently drop and rebuild a live, working index under a
        // possibly-different intentional configuration -- fail closed so an
        // operator investigates the mismatch explicitly.
        throw new Error(
          `[online-migrations] ${HNSW_INDEX_NAME} exists but does not match the declared cosine HNSW contract (m=24, ef_construction=128): ${row.indexdef}`,
        );
      }
    }

    await client.query(`
      CREATE INDEX CONCURRENTLY "${HNSW_INDEX_NAME}"
        ON "asset_embeddings"
        USING hnsw ("image_embedding" vector_cosine_ops)
        WITH (m = 24, ef_construction = 128)
    `);

    const accepted = await client.query(`
      SELECT indisvalid, indisready, pg_get_indexdef(indexrelid) AS indexdef
      FROM pg_index
      WHERE indexrelid = to_regclass($1)
    `, [HNSW_INDEX_NAME]);
    const finalRow = accepted.rows[0];
    if (!finalRow?.indisvalid || !finalRow.indisready || !hnswDefinitionMatches(finalRow.indexdef)) {
      throw new Error('[online-migrations] asset_embeddings_hnsw_idx did not reach a valid, ready, contract-matching state');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await applyOnlineEmbeddingIndex();
  await applyOnlineHnswIndex();
}
