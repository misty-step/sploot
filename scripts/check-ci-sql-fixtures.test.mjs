import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const schema = readFileSync('apps/web/prisma/schema.prisma', 'utf8');
const dbSource = readFileSync('apps/web/lib/db.ts', 'utf8');
const advancedSearchSource = readFileSync('apps/web/app/api/search/advanced/route.ts', 'utf8');
const finalSchemaSource = readFileSync('apps/web/scripts/assert-final-embedding-schema.mjs', 'utf8');
const projectionMigration = readFileSync('apps/web/prisma/migrations/20260715120000_add_asset_embedding_owner_visibility/migration.sql', 'utf8');
const backfillMigration = readFileSync('apps/web/prisma/migrations/20260715121000_backfill_asset_embedding_owner_visibility/migration.sql', 'utf8');
const enforcementMigration = readFileSync('apps/web/prisma/migrations/20260715122000_enforce_asset_embedding_owner_visibility/migration.sql', 'utf8');
const finalizationMigration = readFileSync('apps/web/prisma/migrations/20260715122100_finalize_asset_embedding_owner_visibility/migration.sql', 'utf8');

function validateHnswPlanProbe(workflowText) {
  const probe = workflowText.match(/seed_and_explain_hnsw\(\) \{([\s\S]*?)\n          \}\n\n          assert_hnsw_contract/);
  assert.ok(probe, 'CI must keep one repo-owned HNSW plan probe');
  const source = probe[1];
  assert.match(source, /owner_user_id/);
  assert.match(source, /ae\.status = 'ready'/);
  assert.match(source, /WITH ranked AS MATERIALIZED/);
  assert.match(source, /ae\.image_embedding <=>/);
  assert.match(source, /ORDER BY ae\.image_embedding <=>[\s\S]*ASC LIMIT/);
  assert.match(source, /1 - ranked\.distance AS similarity/);
  assert.match(source, /1 - ranked\.distance >=/);
  assert.match(source, /a\.id ASC/);
  assert.match(source, /SET LOCAL hnsw\.iterative_scan = strict_order/);
  assert.match(source, /SET LOCAL hnsw\.max_scan_tuples = 20000/);
  assert.doesNotMatch(source, /enable_(?:seqscan|bitmapscan)\s*=\s*off/);
  assert.match(source, /Index Scan using asset_embeddings_hnsw_idx/);
  assert.match(source, /default_plan/);
  assert.match(source, /capability_plan/);
  assert.match(source, /default-planner HNSW capability plan/);
}

function timestampContracts(prismaSchema) {
  return [...prismaSchema.matchAll(/model\s+(\w+)\s+\{([\s\S]*?)\n\}/g)]
    .map(([, modelName, body]) => {
      const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? `${modelName}s`;
      const columns = [...body.matchAll(/^\s+(createdAt|updatedAt)\s+DateTime\b([^\n]*)$/gm)]
        .map(([, fieldName, attributes]) => attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName);
      return { modelName, table, columns };
    })
    .filter(({ columns }) => columns.length > 0);
}

function validateCiSqlFixtures(workflowText, prismaSchema) {
  const contracts = timestampContracts(prismaSchema);
  const contractByTable = new Map(contracts.map((contract) => [contract.table, contract]));
  for (const table of ['users', 'assets']) {
    assert.ok(contractByTable.has(table), `schema must define timestamp contract for ${table}`);
  }

  const inserts = [...workflowText.matchAll(/INSERT INTO\s+(?:(?:"?[\w]+"?)\.)?("?[\w]+"?)\s*\(([^)]+)\)/gi)];
  const checkedTables = new Set();
  for (const match of inserts) {
    const table = match[1].replaceAll('"', '');
    const contract = contractByTable.get(table);
    if (!contract) continue;
    checkedTables.add(table);
    const columns = match[2].replaceAll('"', '').split(',').map((column) => column.trim());
    for (const requiredColumn of contract.columns) {
      assert.ok(columns.includes(requiredColumn), `${table} fixture is missing ${requiredColumn}: ${match[0]}`);
    }
  }
  assert.ok(checkedTables.has('users'), 'expected at least one synthetic users fixture');
  assert.ok(checkedTables.has('assets'), 'expected at least one synthetic assets fixture');
}

function validateProductionVectorQueryShapes(dbText, advancedText) {
  assert.match(dbText, /WITH ranked AS MATERIALIZED/);
  assert.match(dbText, /ORDER BY ae\.image_embedding <=>[\s\S]*?ASC, ae\.asset_id ASC/);
  assert.match(dbText, /1 - ranked\.distance AS distance/);
  assert.match(dbText, /a\.owner_user_id =/);
  assert.match(dbText, /a\.deleted_at IS NULL/);
  assert.match(dbText, /ae\.owner_user_id =/);
  assert.match(dbText, /ae\.asset_deleted_at IS NULL/);
  assert.match(dbText, /ae\.status = 'ready'/);
  assert.match(dbText, /SET LOCAL hnsw\.iterative_scan = 'strict_order'/);
  assert.match(dbText, /HNSW_MAX_SCAN_TUPLES = 20_000/);
  assert.match(dbText, /hnsw\.max_scan_tuples/);
  assert.match(dbText, /raw_distance/);
  assert.match(dbText, /rawDistance/);
  assert.match(dbText, /cursor\.rawDistance::double precision/);
  assert.match(dbText, /ae\.asset_id > \${cursor\.id}/);
  assert.doesNotMatch(dbText, /ORDER BY\s+1\s*-\s*\(?.*image_embedding/);

  assert.match(advancedText, /buildRankedEmbeddingCte\(/);
  assert.match(advancedText, /1 - ranked\.distance >=/);
  assert.match(advancedText, /ORDER BY \$\{orderByClause\}/);
  assert.match(advancedText, /ae\.status = 'ready'/);
  assert.match(advancedText, /asset_deleted_at IS NULL/);
  assert.match(advancedText, /queryHnswRanked/);
  assert.match(advancedText, /rankedTagClause/);
  assert.match(advancedText, /tagClause/);
  assert.match(advancedText, /getSearchResultPage/);
  assert.match(advancedText, /setSearchResultPage/);
  assert.doesNotMatch(advancedText, /getSearchResults/);
  assert.doesNotMatch(advancedText, /a\.created_at/);
}

function validateVisibilityMigrationSplit(projection, backfill, enforcement, finalization) {
  assert.match(projection, /ADD COLUMN "owner_user_id" TEXT/);
  assert.match(projection, /CREATE TRIGGER "asset_embeddings_sync_visibility"/);
  assert.match(projection, /CREATE TRIGGER "assets_propagate_embedding_visibility"/);
  assert.doesNotMatch(projection, /UPDATE "asset_embeddings"[\s\S]*FROM "assets"/);

  assert.match(backfill, /FOR UPDATE OF embedding SKIP LOCKED/);
  assert.match(backfill, /p_batch_size/);
  assert.doesNotMatch(backfill, /CALL \"sploot_backfill_asset_embedding_owner_visibility\"/);
  assert.match(backfill, /visibility_backfill_remaining/);

  assert.match(enforcement, /SET lock_timeout = '5s'/);
  assert.match(enforcement, /SET statement_timeout = '30s'/);
  assert.match(enforcement, /CHECK \(\"owner_user_id\" IS NOT NULL\)/);
  assert.doesNotMatch(enforcement, /ALTER COLUMN \"owner_user_id\" SET NOT NULL/);
  assert.match(enforcement, /ADD CONSTRAINT "asset_embeddings_owner_user_id_fkey"/);
  assert.match(enforcement, /NOT VALID/);
  assert.doesNotMatch(enforcement, /VALIDATE CONSTRAINT/);
  assert.match(finalization, /VALIDATE CONSTRAINT \"asset_embeddings_owner_user_id_not_null\"/);
  assert.match(finalization, /VALIDATE CONSTRAINT \"asset_embeddings_owner_user_id_fkey\"/);
  assert.match(finalization, /ALTER COLUMN \"owner_user_id\" SET NOT NULL/);
  assert.match(finalization, /AND attnotnull/);
}

test('CI SQL fixtures supply every schema-owned server timestamp', () => {
  validateCiSqlFixtures(workflow, schema);
});

test('production vector paths keep raw HNSW ordering and exact outer filters', () => {
  validateProductionVectorQueryShapes(dbSource, advancedSearchSource);
});

test('production vector query mutation cannot reintroduce transformed ordering', () => {
  assert.throws(() => validateProductionVectorQueryShapes(
    dbSource.replace('ORDER BY ae.image_embedding <=> ${vectorSql} ASC', 'ORDER BY 1 - (ae.image_embedding <=> ${vectorSql}) DESC'),
    advancedSearchSource,
  ));
  assert.throws(() => validateProductionVectorQueryShapes(
    dbSource,
    advancedSearchSource.replace('buildRankedEmbeddingCte(', 'buildLegacyJoinedVectorQuery('),
  ));
  assert.throws(() => validateProductionVectorQueryShapes(
    dbSource.replace('ae.owner_user_id = ${ownerUserId}', 'TRUE'),
    advancedSearchSource,
  ));
  assert.throws(() => validateProductionVectorQueryShapes(
    dbSource.replace(', ae.asset_id ASC', ''),
    advancedSearchSource,
  ));
});

test('owner visibility migration is additive, resumable, and timeout-bounded', () => {
  validateVisibilityMigrationSplit(projectionMigration, backfillMigration, enforcementMigration, finalizationMigration);
});

test('owner visibility enforcement mutation cannot weaken the final catalog oracle', () => {
  assert.throws(() => validateVisibilityMigrationSplit(
    projectionMigration,
    backfillMigration,
    enforcementMigration,
    finalizationMigration.replace(/\s+AND attnotnull\s+/, '\n'),
  ));
});

test('CI fixture guard rejects a users timestamp omission', () => {
  const mutated = workflow.replace('"createdAt", "updatedAt"', '"createdAt"');
  assert.throws(() => validateCiSqlFixtures(mutated, schema), /users fixture is missing updatedAt/);
});

test('CI fixture guard rejects an assets timestamp omission', () => {
  const mutated = workflow.replace(
    'checksum_sha256, "createdAt", "updatedAt"',
    'checksum_sha256, "createdAt"',
  );
  assert.throws(() => validateCiSqlFixtures(mutated, schema), /assets fixture is missing updatedAt/);
});

test('HNSW probe guards the semantic query and deterministic capability oracle', () => {
  validateHnswPlanProbe(workflow);
  assert.match(workflow, /iterative_scan_supported/);
  assert.match(workflow, /extversion/);
});

test('HNSW probe mutation cannot waive index-use proof or semantic filters', () => {
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace("grep -F 'Index Scan using asset_embeddings_hnsw_idx'", "test -n \"$indexed_plan\"")),
  );
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace("ae.status = 'ready'", "ae.status = 'processing'")),
  );
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace('ORDER BY ae.image_embedding <=>', 'ORDER BY 1 - (ae.image_embedding <=>')),
  );
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace('default-planner HNSW capability plan:', 'SET LOCAL enable_seqscan = off\n            echo default-planner HNSW capability plan:')),
  );
});

test('final schema oracle owns the exact vector index and visibility projection', () => {
  assert.match(finalSchemaSource, /asset_embeddings_hnsw_idx/);
  assert.match(finalSchemaSource, /asset_embeddings/);
  assert.match(finalSchemaSource, /hnsw/);
  assert.match(finalSchemaSource, /vector_cosine_ops/);
  assert.match(finalSchemaSource, /vector\(768\)/);
  assert.match(finalSchemaSource, /m=''\?24''\?/);
  assert.match(finalSchemaSource, /ef_construction=''\?128''\?/);
  assert.match(finalSchemaSource, /attname = 'owner_user_id'[\s\S]*attnotnull/);
  assert.match(finalSchemaSource, /attname = 'asset_deleted_at'[\s\S]*NOT attnotnull/);
  assert.throws(() => {
    assert.match(finalSchemaSource.replaceAll('vector_cosine_ops', 'vector_l2_ops'), /vector_cosine_ops/);
  });
});
