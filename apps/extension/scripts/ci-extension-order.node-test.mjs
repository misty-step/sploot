import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const workflowPath = path.join(root, '.github/workflows/ci.yml');
const packagePath = path.join(root, 'apps/extension/package.json');
const popupTestPath = path.join(root, 'apps/extension/playwright/popup-layout.e2e.ts');

test('production extension transport precedes the real MV3 E2E artifact boundary', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  const popupTest = await readFile(popupTestPath, 'utf8');

  assert.doesNotMatch(workflow, /Test extension narrow layouts in Chrome/);
  assert.match(packageJson.scripts['test:layout'], /playwright\/popup-layout\.e2e\.ts$/);
  assert.match(packageJson.scripts['test:mv3'], /playwright\/mv3-lifecycle\.e2e\.ts$/);
  assert.match(popupTest, /\[280,\s*240\]/, 'popup E2E must retain both narrow layout widths');

  const productionArtifact = workflow.indexOf('Assert production artifact/provenance immediately before upload');
  const upload = workflow.indexOf('actions/upload-artifact@v7');
  const e2eBuild = workflow.indexOf('Build real unpacked MV3 lifecycle harness');
  const popup = workflow.indexOf('Exercise real popup owner isolation in Chromium');
  const lifecycle = workflow.indexOf('Exercise real unpacked MV3 lifecycle in Chromium');
  assert.ok(productionArtifact >= 0, 'production artifact assertion must remain in CI');
  assert.ok(upload > productionArtifact, 'production artifact assertion must precede upload');
  assert.ok(e2eBuild > upload, 'E2E build must follow production artifact upload');
  assert.ok(popup > e2eBuild, 'popup E2E must follow E2E build');
  assert.ok(lifecycle > popup, 'MV3 lifecycle E2E must follow popup E2E');
});
