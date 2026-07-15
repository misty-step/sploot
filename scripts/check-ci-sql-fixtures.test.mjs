import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const schema = readFileSync('apps/web/prisma/schema.prisma', 'utf8');

test('CI users fixtures supply the canonical server-managed timestamps', () => {
  const userModel = schema.match(/model User \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(userModel, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(userModel, /updatedAt\s+DateTime\s+@updatedAt/);

  const inserts = [...workflow.matchAll(/INSERT INTO\s+users\s*\(([^)]+)\)/gi)];
  assert.ok(inserts.length > 0, 'expected at least one synthetic users fixture');
  for (const match of inserts) {
    const columns = match[1].replaceAll(/"/g, '').split(',').map((column) => column.trim());
    assert.ok(columns.includes('createdAt'), `users fixture is missing createdAt: ${match[0]}`);
    assert.ok(columns.includes('updatedAt'), `users fixture is missing updatedAt: ${match[0]}`);
  }
});
