#!/usr/bin/env node

import pg from 'pg';

const { Client } = pg;
const expectedVersion = '20260715055000';

export async function assertFinalEmbeddingSchema(databaseUrl = process.env.DATABASE_URL, ClientConstructor = Client) {
  if (!databaseUrl) throw new Error('[final-schema] DATABASE_URL is required');
  const client = new ClientConstructor({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        to_regclass('public.embedding_rate_buckets') IS NOT NULL
        AND to_regclass('public.embedding_rate_leases') IS NOT NULL
        AND to_regclass('public.embedding_provider_circuits') IS NOT NULL
        AND to_regclass('public.asset_embeddings_pending_next_attempt_idx') IS NOT NULL
        AND to_regclass('public.embedding_provider_circuits_open_until_idx') IS NOT NULL
        AND (SELECT count(*) = 4 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
             AND column_name IN ('generation', 'probe_until', 'probe_generation', 'probe_lease_token'))
        AND (SELECT count(*) = 6 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
             AND column_name IN ('attempt_count', 'next_attempt_at', 'terminal_at', 'processing_claim_token', 'revive_count', 'image_embedding'))
        AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'embedding_attempt_count_ceiling' AND convalidated)
        AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_embeddings_processing_claim_token_state' AND convalidated)
        AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'asset_embeddings_revive_count_bounded' AND convalidated)
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'asset_embeddings_revival_budget' AND NOT tgisinternal)
        AND EXISTS (SELECT 1 FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id = TRUE AND phase = 'ready' AND version = $1)
        AS ready
    `, [expectedVersion]);
    if (result.rows[0]?.ready !== true) {
      throw new Error('[final-schema] final embedding/circuit schema contract is incomplete');
    }
    return true;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname) {
  await assertFinalEmbeddingSchema();
  console.log('[final-schema] verified');
}
