import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  findBundleClerkTelemetryViolations,
  findBundleTelemetryViolations,
  findBundleTelemetryConfigurationViolations,
  bundleFiles,
  findClerkTelemetryMarkerGaps,
  findInventoryDocumentationGaps,
  findTelemetryInventoryViolations,
  CLERK_TELEMETRY_MARKERS,
  TELEMETRY_PRODUCER_INVENTORY,
} from './check-telemetry-inventory.mjs';

test('rejects retired Vercel browser adapters and requests', () => {
  const analyticsPackage = '@' + 'vercel/analytics';
  const speedInsightsPackage = '@' + 'vercel/speed-insights';
  const retiredRequestPath = '/' + '_vercel';
  const violations = findTelemetryInventoryViolations([
    { path: 'apps/web/app/layout.tsx', content: `import { Analytics } from '${analyticsPackage}/react';` },
    { path: 'apps/web/package.json', content: `{ "${speedInsightsPackage}": "1.0.0" }` },
    { path: 'apps/web/.next/static/chunk.js', content: `fetch("${retiredRequestPath}/insights/view")` },
  ]);

  assert.equal(violations.length, 4);
});

test('requires every classified producer to retain its executable marker', () => {
  const files = TELEMETRY_PRODUCER_INVENTORY.map(([path, marker]) => ({ path, content: marker }));
  assert.deepEqual(findInventoryDocumentationGaps(files), []);

  const missing = files.map((file) => ({ ...file }));
  missing[0].content = '';
  assert.equal(findInventoryDocumentationGaps(missing).length, 1);
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

test('bundle scanner walks web static/server and extension service-worker artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'telemetry-inventory-'));
  mkdirSync(join(root, 'web', 'static'), { recursive: true });
  mkdirSync(join(root, 'web', 'server'), { recursive: true });
  mkdirSync(join(root, 'extension'), { recursive: true });
  writeFileSync(join(root, 'web', 'static', 'chunk.js'), 'fetch("/api/telemetry")');
  writeFileSync(join(root, 'web', 'server', 'route.js'), 'logger.logInfo("route")');
  writeFileSync(join(root, 'extension', 'service-worker.js'), 'chrome.runtime.onMessage.addListener(() => {})');

  const files = bundleFiles(root);
  assert.equal(files.length, 3);
  assert.deepEqual(files.map(({ path: filePath }) => filePath).sort(), [
    join(root, 'extension', 'service-worker.js'),
    join(root, 'web', 'server', 'route.js'),
    join(root, 'web', 'static', 'chunk.js'),
  ].map((filePath) => relative(process.cwd(), filePath)).sort());

  rmSync(root, { recursive: true, force: true });
});

test('bundle falsifier rejects provider requests', () => {
  assert.equal(findBundleTelemetryViolations(`fetch("/${'_vercel'}/speed-insights")`).length, 1);
  assert.deepEqual(findBundleTelemetryViolations('fetch("/api/telemetry")'), []);
});

test('requires literal public env reads for Next.js client inlining', () => {
  const source = readFileSync('apps/web/lib/telemetry-client.ts', 'utf8');
  assert.match(source, /process\.env\.NEXT_PUBLIC_TELEMETRY_ENDPOINT/);
  assert.match(source, /process\.env\.NEXT_PUBLIC_TELEMETRY_ENABLED/);
});

test('bundle falsifier proves the selected telemetry configuration was compiled', () => {
  assert.deepEqual(
    findBundleTelemetryConfigurationViolations(
      'const sink={endpoint:"/ci-telemetry-sink",enabled:!1};',
      { endpoint: '/ci-telemetry-sink', enabled: false }
    ),
    []
  );
  assert.equal(
    findBundleTelemetryConfigurationViolations(
      'const sink={endpoint:"/api/telemetry",enabled:!0};',
      { endpoint: '/ci-telemetry-sink', enabled: false }
    ).length,
    2
  );
});

test('requires every Clerk surface to keep its telemetry-disabled marker', () => {
  const files = CLERK_TELEMETRY_MARKERS.map(([path, marker]) => ({ path, content: marker }));
  assert.deepEqual(findClerkTelemetryMarkerGaps(files), []);

  const stripped = files.map((file) => ({ ...file }));
  stripped[0].content = '<ClerkProvider>{children}</ClerkProvider>';
  assert.equal(findClerkTelemetryMarkerGaps(stripped).length, 1);
});

test('compiled Clerk falsifier requires the disabled marker in bundle output', () => {
  // Accepted compiled forms: pretty, minified boolean, quoted property key.
  assert.deepEqual(findBundleClerkTelemetryViolations('a({telemetry:{disabled:true},b:1})'), []);
  assert.deepEqual(findBundleClerkTelemetryViolations('a({telemetry:{disabled:!0},b:1})'), []);
  assert.deepEqual(findBundleClerkTelemetryViolations('a({"telemetry":{"disabled":!0}})'), []);

  // A build where the prop was removed must fail.
  assert.equal(findBundleClerkTelemetryViolations('a({publishableKey:"pk_live_x"})').length, 1);
  // An explicitly enabled collector must fail too.
  assert.equal(findBundleClerkTelemetryViolations('a({telemetry:{disabled:!1}})').length, 1);
});
