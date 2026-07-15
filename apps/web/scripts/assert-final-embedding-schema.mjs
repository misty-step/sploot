#!/usr/bin/env node

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const expectedVersion = readFileSync(resolve(scriptDirectory, '../prisma/stripe-ledger-bootstrap.version'), 'utf8').trim();
const economicsPolicy = JSON.parse(readFileSync(resolve(scriptDirectory, '../../../economics/policy.json'), 'utf8'));
const expectedDailyAttempts = economicsPolicy.global.replicateDailyAttempts;
const expectedMonthlyAttempts = economicsPolicy.global.replicateMonthlyAttempts;
const bootstrapPostSql = readFileSync(resolve(scriptDirectory, '../prisma/stripe-ledger-bootstrap-post.sql'), 'utf8');
const terminalRevivalSql = readFileSync(resolve(
  scriptDirectory,
  '../prisma/migrations/20260715070000_harden_terminal_revival_exit/migration.sql',
), 'utf8');
const terminalRevivalTriggerSql = readFileSync(resolve(
  scriptDirectory,
  '../prisma/migrations/20260715050000_cap_embedding_terminal_revivals/migration.sql',
), 'utf8');

const managedRoles = [
  'sploot_stripe_ledger_owner',
  'sploot_stripe_schema_migrator',
  'sploot_stripe_ledger_issuer',
  'sploot_stripe_ledger_consumer',
  'sploot_stripe_ledger_maintenance',
  'sploot_stripe_adversary',
  'sploot_stripe_app',
];

const functionContracts = [
  ['sploot_append_stripe_event', 'p_event_id text,p_event_type text,p_created_epoch integer,p_livemode boolean,p_account_id text,p_object_id text,p_object_type text,p_signature_timestamp integer,p_raw_payload jsonb,p_payload_digest text,p_raw_body_digest text,p_raw_body_ciphertext bytea,p_raw_body_nonce bytea,p_raw_body_key_id text,p_signature_header_digest text', true, ['sploot_stripe_ledger_issuer']],
  ['sploot_record_stripe_cancellation', 'p_event_id text,p_event_type text,p_created_epoch integer,p_livemode boolean,p_account_id text,p_object_id text,p_object_type text,p_signature_timestamp integer,p_raw_payload jsonb,p_payload_digest text,p_raw_body_digest text,p_raw_body_ciphertext bytea,p_raw_body_nonce bytea,p_raw_body_key_id text,p_signature_header_digest text,p_reason text,p_max_cancellations integer,p_window_seconds integer,p_now integer', true, ['sploot_stripe_ledger_issuer']],
  ['sploot_append_stripe_audit', 'p_event_id text,p_alert_key text,p_action text,p_provenance_digest text,p_details jsonb', true, []],
  ['sploot_stripe_claim_deliveries', 'p_alert_key text,p_now integer,p_lease_seconds integer,p_claim_token text', true, ['sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer']],
  ['sploot_stripe_drain_deliveries', 'p_now integer,p_lease_seconds integer,p_claim_token text', true, ['sploot_stripe_ledger_consumer']],
  ['sploot_stripe_complete_delivery', 'p_delivery_key text,p_alert_key text,p_adapter text,p_replay_key text,p_payload_digest text,p_payload_version text,p_claim_token text,p_generation integer,p_succeeded boolean,p_error text,p_now integer', true, ['sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer']],
  ['sploot_replay_stripe_dead_letter', 'p_replay_key text,p_now integer', true, ['sploot_stripe_ledger_maintenance']],
  ['sploot_stripe_delivery_health', 'p_alert_key text', true, ['sploot_stripe_ledger_issuer', 'sploot_stripe_ledger_consumer', 'sploot_stripe_ledger_maintenance']],
  ['sploot_issue_stripe_maintenance_token', 'p_token_digest text,p_generation integer,p_actor text,p_purpose text,p_subject_kind text,p_subject_id text,p_time_basis text,p_range_start timestamp without time zone,p_range_end timestamp without time zone,p_legal_minimum_since timestamp without time zone,p_issued_at timestamp without time zone,p_expires_at timestamp without time zone', true, ['sploot_stripe_ledger_issuer']],
  ['sploot_stripe_ledger_append_only', '', false, []],
  ['sploot_purge_stripe_audit', 'p_token text,p_generation integer,p_actor text,p_purpose text,p_subject_kind text,p_subject_id text,p_range_start timestamp without time zone,p_range_end timestamp without time zone,p_legal_minimum_since timestamp without time zone', true, ['sploot_stripe_ledger_maintenance']],
  ['sploot_purge_stripe_raw_provenance', 'p_token text,p_generation integer,p_actor text,p_purpose text,p_subject_kind text,p_subject_id text,p_range_start timestamp without time zone,p_range_end timestamp without time zone,p_legal_minimum_since timestamp without time zone', true, ['sploot_stripe_ledger_maintenance']],
];

const functionSources = new Map([...functionContracts, ['enforce_asset_embedding_revival_budget']].map(([name]) => [
  name,
  name === 'enforce_asset_embedding_revival_budget'
    ? extractSqlObject(terminalRevivalSql, 'CREATE OR REPLACE FUNCTION "enforce_asset_embedding_revival_budget"')
    : extractSqlObject(bootstrapPostSql, `CREATE OR REPLACE FUNCTION public.${name}`),
]));

function extractSqlObject(sql, marker) {
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`[final-schema] authoritative SQL object is missing: ${marker}`);
  const end = sql.indexOf('\n$$;', start);
  if (end < 0) throw new Error(`[final-schema] authoritative SQL object is unterminated: ${marker}`);
  return sql.slice(start, end + 4);
}

function normalizeSql(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$[a-z_]*\$/gi, '$$')
    .replaceAll('"', '')
    .replaceAll('public.', '')
    .replace(/!~~/g, 'not like')
    .replace(/set\s+search_path\s*(?:=|to)\s*'?pg_catalog'?\s*,\s*'?public'?(?:::name)?/gi, 'set search_path = pg_catalog, public')
    .replace(/\btimestamp(?:\(\d+\))?(?:\s+without\s+time\s+zone)?/gi, 'timestamp')
    .replace(/::[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?(?:\(\d+\))?(?:\s+(?:without|with)\s+time\s+zone)?/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
    .replace(/;$/, '')
    .toLowerCase();
}

function expectedFunctionDefinition(name) {
  const source = functionSources.get(name);
  if (!source) throw new Error(`[final-schema] no authoritative function definition for ${name}`);
  return normalizeSql(source);
}

function expectedTriggerDefinition(name) {
  const source = name === 'asset_embeddings_revival_budget' ? terminalRevivalTriggerSql : bootstrapPostSql;
  const marker = name === 'asset_embeddings_revival_budget'
    ? 'CREATE TRIGGER "asset_embeddings_revival_budget"'
    : `CREATE TRIGGER ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`[final-schema] authoritative trigger is missing: ${name}`);
  const end = source.indexOf(';', start);
  return normalizeSql(source.slice(start, end + 1));
}

const expectedColumns = {
  asset_embeddings: {
    attempt_count: ['integer', true, '0'],
    next_attempt_at: ['timestamp(3) without time zone', false, null],
    terminal_at: ['timestamp(3) without time zone', false, null],
    processing_claim_token: ['text', false, null],
    revive_count: ['integer', true, '0'],
    image_embedding: ['vector(768)', false, null],
  },
  embedding_provider_circuits: {
    generation: ['integer', true, '0'],
    probe_until: ['timestamp(3) without time zone', false, null],
    probe_generation: ['integer', false, null],
    probe_lease_token: ['text', false, null],
  },
};

const expectedConstraints = {
  embedding_attempt_count_ceiling: `CHECK ((((key NOT LIKE 'embedding:daily:%') OR (count <= ${expectedDailyAttempts})) AND ((key NOT LIKE 'embedding:monthly:%') OR (count <= ${expectedMonthlyAttempts}))))`,
  asset_embeddings_processing_claim_token_state: "CHECK (((processing_claim_token IS NULL) OR (status = 'processing')))",
  asset_embeddings_revive_count_bounded: 'CHECK (((revive_count >= 0) AND (revive_count <= 1)))',
};

const expectedIndexes = {
  asset_embeddings_pending_next_attempt_idx: 'CREATE INDEX asset_embeddings_pending_next_attempt_idx ON public.asset_embeddings USING btree (status, next_attempt_at, createdAt) WHERE ((status = \'pending\') AND (terminal_at IS NULL))',
  embedding_provider_circuits_open_until_idx: 'CREATE INDEX embedding_provider_circuits_open_until_idx ON public.embedding_provider_circuits USING btree (open_until)',
};

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
             AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator')
        AND (SELECT count(*) = 1
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE n.nspname = 'public'
             AND c.relname = 'embedding_provider_circuits_open_until_idx'
             AND pg_get_userbyid(c.relowner) = 'sploot_stripe_schema_migrator')
        AND (SELECT count(*) = 4 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'embedding_provider_circuits'
             AND column_name IN ('generation', 'probe_until', 'probe_generation', 'probe_lease_token'))
        AND (SELECT count(*) = 6 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'asset_embeddings'
             AND column_name IN ('attempt_count', 'next_attempt_at', 'terminal_at', 'processing_claim_token', 'revive_count', 'image_embedding'))
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'embedding_attempt_count_ceiling'
                    AND convalidated)
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'asset_embeddings_processing_claim_token_state'
                    AND convalidated)
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'asset_embeddings_revive_count_bounded'
                    AND convalidated)
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
        AND has_schema_privilege('sploot_stripe_app', 'sploot_bootstrap', 'USAGE')
        AND has_table_privilege('sploot_stripe_app', 'sploot_bootstrap.stripe_ledger_bootstrap_state', 'SELECT')
        AND NOT has_table_privilege('sploot_stripe_app', 'sploot_bootstrap.stripe_ledger_bootstrap_state', 'INSERT,UPDATE,DELETE')
        AND has_table_privilege('sploot_stripe_app', 'public._prisma_migrations', 'SELECT')
        AND NOT has_table_privilege('sploot_stripe_app', 'public._prisma_migrations', 'INSERT,UPDATE,DELETE')
        AND EXISTS (SELECT 1 FROM sploot_bootstrap.stripe_ledger_bootstrap_state WHERE id = TRUE AND phase = 'ready' AND version = $1)
        AS ready
    `, [expectedVersion]);
    if (result.rows[0]?.ready !== true) {
      throw new Error('[final-schema] final embedding/circuit schema contract is incomplete');
    }

    const exactColumns = await client.query(`
      SELECT c.relname AS table_name, a.attname AS column_name,
             pg_catalog.format_type(a.atttypid, a.atttypmod) AS type_name,
             a.attnotnull AS not_null,
             pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1::text[])
        AND a.attname = ANY($2::text[])
        AND a.attnum > 0 AND NOT a.attisdropped
    `, [Object.keys(expectedColumns), [...new Set(Object.values(expectedColumns).flatMap((columns) => Object.keys(columns)))] ]);
    for (const [tableName, columns] of Object.entries(expectedColumns)) {
      for (const [columnName, [typeName, notNull, columnDefault]] of Object.entries(columns)) {
        const row = exactColumns.rows.find((candidate) => candidate.table_name === tableName && candidate.column_name === columnName);
        if (!row || normalizeSql(row.type_name) !== normalizeSql(typeName)
          || row.not_null !== notNull
          || (row.column_default === null ? null : normalizeSql(row.column_default)) !== (columnDefault === null ? null : normalizeSql(columnDefault))) {
          throw new Error(`[final-schema] exact column contract mismatch: ${tableName}.${columnName}`);
        }
      }
    }

    const exactIndexes = await client.query(`
      SELECT c.relname AS index_name, pg_catalog.pg_get_indexdef(i.indexrelid) AS definition,
             pg_catalog.pg_get_userbyid(c.relowner) AS owner
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, [Object.keys(expectedIndexes)]);
    for (const [indexName, definition] of Object.entries(expectedIndexes)) {
      const row = exactIndexes.rows.find((candidate) => candidate.index_name === indexName);
      if (!row || row.owner !== 'sploot_stripe_schema_migrator' || normalizeSql(row.definition) !== normalizeSql(definition)) {
        throw new Error(`[final-schema] exact index contract mismatch: ${indexName}`);
      }
    }

    const exactConstraints = await client.query(`
      SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition, convalidated
      FROM pg_catalog.pg_constraint
      WHERE conname = ANY($1::text[])
    `, [Object.keys(expectedConstraints)]);
    for (const [constraintName, definition] of Object.entries(expectedConstraints)) {
      const row = exactConstraints.rows.find((candidate) => candidate.conname === constraintName);
      if (!row || row.convalidated !== true || normalizeSql(row.definition) !== normalizeSql(definition)) {
        throw new Error(`[final-schema] exact constraint contract mismatch: ${constraintName}`);
      }
    }

    const functionNames = [
      ...functionContracts.map(([name]) => name),
      'enforce_asset_embedding_revival_budget',
    ];
    const exactFunctions = await client.query(`
      SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
             pg_catalog.pg_get_functiondef(p.oid) AS definition,
             pg_catalog.pg_get_userbyid(p.proowner) AS owner,
             p.prosecdef, COALESCE(p.proconfig, ARRAY[]::text[]) AS config,
             has_function_privilege('sploot_stripe_ledger_issuer', p.oid, 'EXECUTE') AS issuer_execute,
             has_function_privilege('sploot_stripe_ledger_consumer', p.oid, 'EXECUTE') AS consumer_execute,
             has_function_privilege('sploot_stripe_ledger_maintenance', p.oid, 'EXECUTE') AS maintenance_execute,
             has_function_privilege('sploot_stripe_schema_migrator', p.oid, 'EXECUTE') AS migrator_execute,
             has_function_privilege('sploot_stripe_app', p.oid, 'EXECUTE') AS app_execute,
             EXISTS (
               SELECT 1
               FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
               WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
             ) AS public_execute
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
    `, [functionNames]);
    if (exactFunctions.rows.length !== functionNames.length) {
      throw new Error('[final-schema] final function set is incomplete or duplicated');
    }
    const roleColumns = {
      sploot_stripe_ledger_issuer: 'issuer_execute',
      sploot_stripe_ledger_consumer: 'consumer_execute',
      sploot_stripe_ledger_maintenance: 'maintenance_execute',
      sploot_stripe_schema_migrator: 'migrator_execute',
      sploot_stripe_app: 'app_execute',
      public: 'public_execute',
    };
    for (const row of exactFunctions.rows) {
      const contract = row.proname === 'enforce_asset_embedding_revival_budget'
        ? ['enforce_asset_embedding_revival_budget', '', false, ['sploot_stripe_schema_migrator']]
        : functionContracts.find(([name]) => name === row.proname);
      if (!contract || row.owner !== (row.proname === 'enforce_asset_embedding_revival_budget'
        ? 'sploot_stripe_schema_migrator'
        : 'sploot_stripe_ledger_owner')) {
        throw new Error(`[final-schema] function owner contract mismatch: ${row.proname}`);
      }
      const [, identityArguments, securityDefiner, allowedRoles] = contract;
      if (normalizeSql(row.identity_arguments) !== normalizeSql(identityArguments)
        || row.prosecdef !== securityDefiner
        || normalizeSql(row.definition) !== expectedFunctionDefinition(row.proname)) {
        throw new Error(`[final-schema] exact function definition contract mismatch: ${row.proname}`);
      }
      const expectedSearchPath = row.proname === 'enforce_asset_embedding_revival_budget' ? [] : ['search_path=pg_catalog, public'];
      if (row.proname !== 'enforce_asset_embedding_revival_budget'
        && normalizeSql(row.config.join(',')) !== normalizeSql(expectedSearchPath.join(','))) {
        throw new Error(`[final-schema] function search_path contract mismatch: ${row.proname}`);
      }
      for (const [role, column] of Object.entries(roleColumns)) {
        if (Boolean(row[column]) !== (allowedRoles.includes(role))) {
          throw new Error(`[final-schema] function grant contract mismatch: ${row.proname}/${role}`);
        }
      }
    }

    const triggerContracts = {
      stripe_cancellation_events_append_only: ['sploot_stripe_ledger_owner', 'A'],
      stripe_cancellation_audit_append_only: ['sploot_stripe_ledger_owner', 'A'],
      stripe_cancellation_maintenance_append_only: ['sploot_stripe_ledger_owner', 'A'],
      asset_embeddings_revival_budget: ['sploot_stripe_schema_migrator', 'O'],
    };
    const exactTriggers = await client.query(`
      SELECT tr.tgname, pg_catalog.pg_get_triggerdef(tr.oid) AS definition, tr.tgenabled,
             pg_catalog.pg_get_userbyid(fn.proowner) AS function_owner
      FROM pg_catalog.pg_trigger tr
      JOIN pg_catalog.pg_class t ON t.oid = tr.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_catalog.pg_proc fn ON fn.oid = tr.tgfoid
      WHERE n.nspname = 'public' AND tr.tgname = ANY($1::text[]) AND NOT tr.tgisinternal
    `, [Object.keys(triggerContracts)]);
    for (const [triggerName, [functionOwner, enabled]] of Object.entries(triggerContracts)) {
      const row = exactTriggers.rows.find((candidate) => candidate.tgname === triggerName);
      if (!row || row.tgenabled !== enabled || row.function_owner !== functionOwner
        || normalizeSql(row.definition) !== expectedTriggerDefinition(triggerName)) {
        throw new Error(`[final-schema] exact trigger contract mismatch: ${triggerName}`);
      }
    }

    const exactRoles = await client.query(`
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
             rolreplication, rolbypassrls
      FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])
    `, [managedRoles]);
    if (exactRoles.rows.length !== managedRoles.length || exactRoles.rows.some((row) =>
      row.rolsuper || row.rolinherit || row.rolcreaterole || row.rolcreatedb || row.rolreplication || row.rolbypassrls)) {
      throw new Error('[final-schema] managed role privilege contract is unsafe or incomplete');
    }
    const memberships = await client.query(`
      SELECT 1
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles granted ON granted.oid = m.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = m.member
      WHERE granted.rolname = ANY($1::text[]) OR member.rolname = ANY($1::text[])
    `, [managedRoles]);
    if (memberships.rows.length !== 0) {
      throw new Error('[final-schema] managed role memberships are not converged');
    }

    const exactTables = await client.query(`
      SELECT c.relname, pg_catalog.pg_get_userbyid(c.relowner) AS owner
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    `, [['stripe_cancellation_events', 'stripe_cancellation_audit', 'stripe_cancellation_alerts', 'stripe_cancellation_deliveries', 'stripe_cancellation_maintenance', 'stripe_cancellation_maintenance_tokens']]);
    if (exactTables.rows.length !== 6 || exactTables.rows.some((row) => row.owner !== 'sploot_stripe_ledger_owner')) {
      throw new Error('[final-schema] Stripe table ownership contract is incomplete');
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
