import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('repository Stripe sandbox check passes without revealing credentials', () => {
  const output = execFileSync(process.execPath, ['scripts/check-stripe-sandbox.mjs'], { encoding: 'utf8' });
  assert.match(output, /Stripe sandbox check passed/);
  assert.doesNotMatch(output, /(?:sk|rk)_live_/);
});
