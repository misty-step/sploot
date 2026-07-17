import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dbSource = readFileSync('apps/web/lib/db.ts', 'utf8');
const advancedSearchSource = readFileSync('apps/web/app/api/search/advanced/route.ts', 'utf8');
const projectionMigration = readFileSync('apps/web/prisma/migrations/20260715120000_add_asset_embedding_owner_visibility/migration.sql', 'utf8');
const backfillMigration = readFileSync('apps/web/prisma/migrations/20260715121000_backfill_asset_embedding_owner_visibility/migration.sql', 'utf8');
const enforcementMigration = readFileSync('apps/web/prisma/migrations/20260715122000_enforce_asset_embedding_owner_visibility/migration.sql', 'utf8');
const finalizationMigration = readFileSync('apps/web/prisma/migrations/20260715122100_finalize_asset_embedding_owner_visibility/migration.sql', 'utf8');
const bootstrapPostSource = readFileSync('apps/web/prisma/stripe-ledger-bootstrap-post.sql', 'utf8');
const bootstrapRollbackSource = readFileSync('apps/web/prisma/stripe-ledger-bootstrap-rollback.sql', 'utf8');

function assertVectorShapes(dbText, advancedText) {
  assert.match(dbText, /WITH ranked AS MATERIALIZED/);
  assert.match(dbText, /ORDER BY ae\.image_embedding <=>[\s\S]*?ASC, ae\.asset_id ASC/);
  assert.match(dbText, /1 - ranked\.distance AS distance/);
  assert.match(dbText, /ae\.owner_user_id =/);
  assert.match(dbText, /ae\.asset_deleted_at IS NULL/);
  assert.match(dbText, /ae\.status = 'ready'/);
  assert.match(dbText, /raw_distance/);
  assert.match(dbText, /rawDistance/);
  assert.match(dbText, /cursor\.rawDistance\}::double precision/);
  assert.match(dbText, /ae\.asset_id > \${cursor\.id}/);
  assert.doesNotMatch(dbText, /1 - \(ae\.image_embedding <=> \${vectorSql}\\\) DESC/);
  assert.match(advancedText, /created_at/);
  assert.doesNotMatch(advancedText, /getSearchResults\(/);
}

function assertVisibilitySplit(projection, backfill, enforcement, finalization) {
  assert.match(projection, /ADD COLUMN "owner_user_id" TEXT/);
  assert.match(projection, /CREATE TRIGGER "asset_embeddings_sync_visibility"/);
  assert.match(backfill, /FOR UPDATE OF embedding SKIP LOCKED/);
  assert.match(backfill, /p_batch_size/);
  assert.doesNotMatch(backfill, /CALL "sploot_backfill_asset_embedding_owner_visibility"/);
  assert.match(backfill, /visibility_backfill_remaining/);
  assert.match(enforcement, /SET lock_timeout = '5s'/);
  assert.match(enforcement, /SET statement_timeout = '30s'/);
  assert.match(enforcement, /CHECK \("owner_user_id" IS NOT NULL\)/);
  assert.match(enforcement, /ADD CONSTRAINT "asset_embeddings_owner_user_id_fkey"/);
  assert.match(enforcement, /NOT VALID/);
  assert.doesNotMatch(enforcement, /VALIDATE CONSTRAINT/);
  assert.match(finalization, /VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_not_null"/);
  assert.match(finalization, /VALIDATE CONSTRAINT "asset_embeddings_owner_user_id_fkey"/);
  assert.match(finalization, /ALTER COLUMN "owner_user_id" SET NOT NULL/);
}

test('production vector paths keep raw HNSW ordering and exact outer filters', () => {
  assertVectorShapes(dbSource, advancedSearchSource);
});

test('privileged bootstrap revokes functions and procedures by pg_proc kind', () => {
  for (const source of [bootstrapPostSource, bootstrapRollbackSource]) {
    assert.match(source, /p\.prokind/);
    assert.match(source, /CASE WHEN fn\.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION'/);
    assert.match(source, /REVOKE ALL ON %s %s/);
  }
  assert.match(bootstrapPostSource, /p\.proname LIKE 'sploot\\_%'/);
});

test('owner visibility migration is additive, resumable, and finalizable separately', () => {
  assertVisibilitySplit(projectionMigration, backfillMigration, enforcementMigration, finalizationMigration);
});
