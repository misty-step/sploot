import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  findBundleTelemetryViolations,
  findBundleTelemetryConfigurationViolations,
  findInventoryDocumentationGaps,
  findTelemetryInventoryViolations,
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
