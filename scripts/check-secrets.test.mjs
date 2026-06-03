import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const scanner = path.join(repoRoot, 'scripts/check-secrets.mjs');

function runScanner(contents) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sploot-secret-scan-'));
  const file = path.join(dir, 'fixture.txt');
  writeFileSync(file, contents);
  return spawnSync(process.execPath, [scanner, file], { encoding: 'utf8' });
}

test('allows documented placeholder Neon URLs', () => {
  const result = runScanner(
    'DATABASE_URL=postgresql://user:password@host-pooler.neon.tech/database?sslmode=require&pgbouncer=true\n',
  );

  assert.equal(result.status, 0, result.stderr);
});

test('blocks real-looking Neon Postgres URLs in prose', () => {
  const blockedUrl = [
    'postgresql://sploot_owner:s3cr3tValue123@',
    'ep-small-hill-123456.us-east-2.aws.',
    'neon.tech/sploot?sslmode=require',
  ].join('');
  const result = runScanner(
    `Use ${blockedUrl}\n`,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /real-neon-postgres-url/);
  assert.doesNotMatch(result.stderr, /s3cr3tValue123/);
});

test('blocks real-looking service token assignments', () => {
  const result = runScanner('REPLICATE_API_TOKEN=r8_abcdefghijklmnop\n');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /real-secret-assignment:REPLICATE_API_TOKEN/);
  assert.doesNotMatch(result.stderr, /r8_abcdefghijklmnop/);
});
