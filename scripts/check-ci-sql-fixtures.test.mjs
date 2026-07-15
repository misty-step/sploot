import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const schema = readFileSync('apps/web/prisma/schema.prisma', 'utf8');

function validateHnswPlanProbe(workflowText) {
  const probe = workflowText.match(/seed_and_explain_hnsw\(\) \{([\s\S]*?)\n          \}\n\n          assert_hnsw_contract/);
  assert.ok(probe, 'CI must keep one repo-owned HNSW plan probe');
  const source = probe[1];
  assert.match(source, /owner_user_id/);
  assert.match(source, /ae\.status = 'ready'/);
  assert.match(source, /1 - \(ae\.image_embedding <=>/);
  assert.match(source, /a\.id ASC/);
  assert.match(source, /SET LOCAL enable_seqscan = off/);
  assert.match(source, /SET LOCAL enable_bitmapscan = off/);
  assert.match(source, /BEGIN; SET LOCAL enable_seqscan = off; SET LOCAL enable_bitmapscan = off; EXPLAIN[\s\S]*ROLLBACK/);
  assert.match(source, /Index Scan using asset_embeddings_hnsw_idx/);
  assert.match(source, /default_plan/);
  assert.match(source, /transaction-local HNSW capability plan/);
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

  const inserts = [...workflowText.matchAll(/INSERT INTO\s+(["\w]+)\s*\(([^)]+)\)/gi)];
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

test('CI SQL fixtures supply every schema-owned server timestamp', () => {
  validateCiSqlFixtures(workflow, schema);
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
});

test('HNSW probe mutation cannot waive index-use proof or semantic filters', () => {
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace("grep -F 'Index Scan using asset_embeddings_hnsw_idx'", "test -n \"$indexed_plan\"")),
  );
  assert.throws(
    () => validateHnswPlanProbe(workflow.replace("ae.status = 'ready'", "ae.status = 'processing'")),
  );
});
