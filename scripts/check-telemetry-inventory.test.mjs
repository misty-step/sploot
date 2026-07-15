import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findBundleTelemetryViolations,
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
