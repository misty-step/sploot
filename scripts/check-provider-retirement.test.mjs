import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findIgnoredEnvironmentViolations,
  findProviderRetirementViolations,
  formatProviderRetirementViolation,
  isHistoricalPath,
} from './check-provider-retirement.mjs';

test('permits the explicit Vercel Blob data-plane exception', () => {
  const violations = findProviderRetirementViolations([{
    path: 'apps/web/lib/blob.ts',
    content: "import { put } from '@vercel/blob';\nconst token = process.env.BLOB_READ_WRITE_TOKEN;\nhttps://x.public.blob.vercel-storage.com/a.png",
  }]);

  assert.deepEqual(violations, []);
});

test('rejects non-Blob runtime packages, environment, CLI, and URLs', () => {
  const violations = findProviderRetirementViolations([{
    path: 'apps/web/lib/runtime.ts',
    content: "import { kv } from '@vercel/kv';\nprocess.env.VERCEL_ENV;\nvercel deploy\nhttps://old.vercel.app",
  }]);

  assert.deepEqual(
    violations.map(({ rule }) => rule),
    [
      'non-Blob Vercel package',
      'Vercel runtime environment',
      'Vercel compute CLI',
      'Vercel compute URL',
    ]
  );
});

test('allows only the exact Vercel Blob package name', () => {
  const violations = findProviderRetirementViolations([{
    path: 'apps/web/lib/runtime.ts',
    content: [
      "import { put } from '@vercel/blob';",
      "import danger from '@vercel/blob-foo';",
      "import dangerTwo from '@vercel/blob2';",
      "const isBlobHost = url.includes('vercel');",
    ].join('\n'),
  }]);

  assert.deepEqual(
    violations.map(({ rule, line }) => ({ rule, line })),
    [
      { rule: 'non-Blob Vercel package', line: 2 },
      { rule: 'non-Blob Vercel package', line: 3 },
    ],
  );
});

test('rejects every supported spelling of the Vercel compute CLI', () => {
  const violations = findProviderRetirementViolations([{
    path: 'scripts/deploy.sh',
    content: [
      'vercel',
      'vercel --prod',
      'npx vercel',
      'pnpm exec vercel --prod',
      "exec('vercel --prod')",
    ].join('\n'),
  }]);

  assert.deepEqual(
    violations.map(({ rule, line }) => ({ rule, line })),
    [
      { rule: 'Vercel compute CLI', line: 1 },
      { rule: 'Vercel compute CLI', line: 2 },
      { rule: 'Vercel compute CLI', line: 3 },
      { rule: 'Vercel compute CLI', line: 4 },
      { rule: 'Vercel compute CLI', line: 5 },
    ],
  );
});

test('rejects compute manifests even when empty', () => {
  const violations = findProviderRetirementViolations([{
    path: 'apps/web/vercel.json',
    content: '{}',
  }]);

  assert.deepEqual(violations.map(({ rule }) => rule), ['compute manifest']);
});

test('keeps dated evidence and architectural records readable', () => {
  assert.equal(isHistoricalPath('docs/qa/evidence/2026-06-23-fly-spike/fly.toml'), true);
  assert.equal(isHistoricalPath('apps/web/docs/adr/009-stack-sovereignty-spike-leave-vercel-keep-neon.md'), true);
  assert.deepEqual(findProviderRetirementViolations([{
    path: 'CHANGELOG.md',
    content: "removed @vercel/kv after migration",
  }]), []);
});

test('scans ordinary files while preserving historical records elsewhere', () => {
  assert.equal(isHistoricalPath('docs/current-plan.md'), false);

  const violations = findProviderRetirementViolations([{
    path: 'docs/current-plan.md',
    content: 'rollback with vercel --prod',
  }]);

  assert.deepEqual(violations.map(({ rule }) => rule), ['Vercel compute CLI']);
});

test('rejects retired Canary paths and runtime markers', () => {
  const violations = findProviderRetirementViolations([
    {
      path: '.canary/integration.json',
      content: '{}',
    },
    {
      path: 'apps/web/lib/legacy-observability.ts',
      content: [
        'process.env.CANARY_API_KEY;',
        "import './canary-reporter';",
        "fetch('https://canary.mistystep.io');",
        "headers.set('X-Sploot-Canary-Owner', 'route');",
      ].join('\n'),
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule }) => rule),
    [
      'retired Canary integration artifact',
      'retired Canary environment',
      'retired Canary reporter',
      'retired Canary endpoint',
      'retired Canary ownership header',
    ],
  );
});

test('keeps immutable screenshot capture provenance readable', () => {
  const violations = findProviderRetirementViolations([{
    path: 'apps/web/public/screenshots/capture-manifest.json',
    content: 'apps/web/lib/canary-reporter.ts',
  }]);

  assert.deepEqual(violations, []);
});

test('reports retired Canary env names without exposing values', () => {
  const sensitiveValue = 'another-sensitive-value';
  const violations = findIgnoredEnvironmentViolations([{
    path: 'apps/web/.env.local',
    content: `SAFE=value\nCANARY_API_KEY=${sensitiveValue}\n`,
  }]);

  assert.deepEqual(violations, [{
    path: 'apps/web/.env.local',
    line: 2,
    rule: 'retired Canary environment',
    identifier: 'CANARY_API_KEY',
  }]);
  assert.doesNotMatch(JSON.stringify(violations), new RegExp(sensitiveValue));
});

test('reports forbidden identifiers in ignored environment files without values', () => {
  const sensitiveValue = 'sensitive-value-that-must-never-appear';
  const violations = findIgnoredEnvironmentViolations([{
    path: 'apps/web/.env.local',
    content: `SAFE=value\nVERCEL_OIDC_TOKEN=${sensitiveValue}\n`,
  }]);

  assert.deepEqual(violations, [{
    path: 'apps/web/.env.local',
    line: 2,
    rule: 'Vercel runtime environment',
    identifier: 'VERCEL_OIDC_TOKEN',
  }]);
  assert.doesNotMatch(JSON.stringify(violations), new RegExp(sensitiveValue));

  const message = formatProviderRetirementViolation(violations[0]);
  assert.equal(
    message,
    '- apps/web/.env.local:2 Vercel runtime environment (VERCEL_OIDC_TOKEN)',
  );
  assert.doesNotMatch(message, new RegExp(sensitiveValue));
});
