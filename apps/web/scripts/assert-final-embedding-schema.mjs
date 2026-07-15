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
        AND (SELECT count(*) = 1
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE n.nspname = 'public'
             AND c.relname = 'asset_embeddings_pending_next_attempt_idx'
             AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator'
             AND pg_get_indexdef(i.indexrelid) LIKE '%ON public.asset_embeddings%'
             AND pg_get_indexdef(i.indexrelid) LIKE '%(status, next_attempt_at, "createdAt")%'
             AND pg_get_indexdef(i.indexrelid) LIKE '%status = ''pending''%'
             AND pg_get_indexdef(i.indexrelid) LIKE '%terminal_at IS NULL%')
        AND (SELECT count(*) = 1
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE n.nspname = 'public'
             AND c.relname = 'embedding_provider_circuits_open_until_idx'
             AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator'
             AND pg_get_indexdef(i.indexrelid) LIKE '%ON public.embedding_provider_circuits%'
             AND pg_get_indexdef(i.indexrelid) LIKE '%(open_until)%')
        AND (SELECT count(*) = 4 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
             AND column_name IN ('generation', 'probe_until', 'probe_generation', 'probe_lease_token'))
        AND (SELECT count(*) = 6 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
             AND column_name IN ('attempt_count', 'next_attempt_at', 'terminal_at', 'processing_claim_token', 'revive_count', 'image_embedding'))
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'embedding_attempt_count_ceiling'
                    AND convalidated
                    AND pg_get_constraintdef(oid) LIKE '%count <= 684%'
                    AND pg_get_constraintdef(oid) LIKE '%count <= 20547%')
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'asset_embeddings_processing_claim_token_state'
                    AND convalidated
                    AND pg_get_constraintdef(oid) LIKE '%processing_claim_token%'
                    AND pg_get_constraintdef(oid) LIKE '%status = ''processing''%')
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'asset_embeddings_revive_count_bounded'
                    AND convalidated
                    AND pg_get_constraintdef(oid) LIKE '%revive_count >= 0%'
                    AND pg_get_constraintdef(oid) LIKE '%revive_count <= 1%')
        AND EXISTS (SELECT 1
                    FROM pg_trigger tr
                    JOIN pg_proc fn ON fn.oid = tr.tgfoid
                    WHERE tr.tgname = 'asset_embeddings_revival_budget'
                    AND NOT tr.tgisinternal
                    AND pg_get_userbyid(fn.proowner) = 'sploot_stripe_schema_migrator')
        AND (SELECT count(*) = 6
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
             AND c.relname = ANY (ARRAY[
               'stripe_cancellation_events', 'stripe_cancellation_audit',
               'stripe_cancellation_alerts', 'stripe_cancellation_deliveries',
               'stripe_cancellation_maintenance', 'stripe_cancellation_maintenance_tokens'
             ])
             AND pg_get_userbyid(c.relowner) = 'sploot_stripe_ledger_owner')
        AND (SELECT count(*) = 12
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
             AND p.proname = ANY (ARRAY[
               'sploot_append_stripe_event', 'sploot_record_stripe_cancellation',
               'sploot_append_stripe_audit', 'sploot_stripe_claim_deliveries',
               'sploot_stripe_drain_deliveries', 'sploot_stripe_complete_delivery',
               'sploot_replay_stripe_dead_letter', 'sploot_stripe_delivery_health',
               'sploot_issue_stripe_maintenance_token', 'sploot_stripe_ledger_append_only',
               'sploot_purge_stripe_audit', 'sploot_purge_stripe_raw_provenance'
             ])
             AND pg_get_userbyid(p.proowner) = 'sploot_stripe_ledger_owner')
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
