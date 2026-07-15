#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('[online-migrations] DATABASE_URL is required');
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  // This script is intentionally outside Prisma Migrate's transaction. The
  // migration that adds the referenced columns runs first; this postcondition
  // can then be retried safely on every deploy.
  await client.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "asset_embeddings_pending_next_attempt_idx"
      ON "asset_embeddings"("status", "next_attempt_at", "createdAt")
      WHERE "status" = 'pending' AND "terminal_at" IS NULL
  `);
} finally {
  await client.end();
}
