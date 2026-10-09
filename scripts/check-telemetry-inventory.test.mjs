import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  findBundleTelemetryViolations,
  bundleFiles,
  findTelemetryInventoryViolations,
} from './check-telemetry-inventory.mjs';

test('rejects retired Vercel browser adapters and requests', () => {
  const analyticsPackage = '@' + 'vercel/analytics';
  const speedInsightsPackage = '@' + 'vercel/speed-insights';
  const retiredRequestPath = '/' + '_vercel';
  const violations = findTelemetryInventoryViolations([
    { path: 'apps/extension/entrypoints/popup/App.tsx', content: `import { Analytics } from '${analyticsPackage}/react';` },
    { path: 'apps/extension/package.json', content: `{ "${speedInsightsPackage}": "1.0.0" }` },
    { path: 'apps/server/internal/web/static/app.js', content: `fetch("${retiredRequestPath}/insights/view")` },
  ]);

  assert.equal(violations.length, 3);
});

test('explicit bundle directories fail closed when missing or empty', () => {
  const root = mkdtempSync(join(tmpdir(), 'telemetry-inventory-'));
  const missing = join(root, 'missing');
  const empty = join(root, 'empty');
  mkdirSync(empty);

  assert.throws(() => bundleFiles(missing), /does not exist/);
  assert.throws(() => bundleFiles(empty), /no JavaScript artifacts/);
  assert.throws(
    () => execFileSync(process.execPath, ['scripts/check-telemetry-inventory.mjs', '--bundle-dir', missing], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }),
    /explicit --bundle-dir does not exist/
  );

  rmSync(root, { recursive: true, force: true });
});

test('bundle scanner walks native and extension service-worker artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'telemetry-inventory-'));
  mkdirSync(join(root, 'native'), { recursive: true });
  mkdirSync(join(root, 'extension'), { recursive: true });
  writeFileSync(join(root, 'native', 'app.js'), 'document.body.addEventListener("click", () => {})');
  writeFileSync(join(root, 'extension', 'service-worker.js'), 'chrome.runtime.onMessage.addListener(() => {})');

  const files = bundleFiles(root);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map(({ path: filePath }) => filePath).sort(), [
    join(root, 'extension', 'service-worker.js'),
    join(root, 'native', 'app.js'),
  ].map((filePath) => relative(process.cwd(), filePath)).sort());

  rmSync(root, { recursive: true, force: true });
});

test('bundle falsifier rejects provider requests', () => {
  assert.equal(findBundleTelemetryViolations(`fetch("/${'_vercel'}/speed-insights")`).length, 1);
  assert.deepEqual(findBundleTelemetryViolations('fetch("/api/telemetry")'), []);
});

test('requires the paired extension to omit Clerk', () => {
  const content = JSON.stringify({ dependencies: { '@clerk/chrome-extension': '2.0.0' } });
  assert.deepEqual(findTelemetryInventoryViolations([{ path: 'apps/extension/package.json', content }]), [
    { path: 'apps/extension/package.json', line: 1, rule: 'device-paired extension must not depend on Clerk' },
  ]);
});
