#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TELEMETRY_PRODUCER_INVENTORY = [
  ['apps/web/hooks/use-upload-queue.ts', 'track(', 'browser product events', 'first-party:/api/telemetry'],
  ['apps/web/hooks/use-assets.ts', 'track(', 'browser product events', 'first-party:/api/telemetry'],
  ['apps/web/app/app/page.tsx', 'track(', 'browser product events', 'first-party:/api/telemetry'],
  ['apps/web/components/error-boundary.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/components/share/share-page-error-boundary.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/components/library/image-tile-error-boundary.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/app/error.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/app/global-error.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/app/app/error.tsx', 'sendClientErrorTelemetry', 'browser error signal', 'first-party:/api/telemetry'],
  ['apps/web/components/library/image-tile.tsx', 'postBlobLoadFailure', 'browser storage health signal', 'first-party:/api/telemetry'],
  ['apps/web/lib/performance-metrics.ts', 'postPerformanceMetric', 'browser performance metrics', 'first-party:/api/telemetry'],
  ['apps/web/lib/performance-monitor.ts', 'trackTiming', 'browser/server timing metrics', 'structured logger'],
  ['apps/web/app/api/telemetry/route.ts', "logger.logInfo('analytics:event'", 'server telemetry sink', 'structured logger'],
  ['apps/web/app/api/search/route.ts', 'logSearch(', 'search observability', 'Postgres searchLog (intentional)'],
  ['apps/web/app/api/search/advanced/route.ts', 'logSearch(', 'search observability', 'Postgres searchLog (intentional)'],
  ['apps/web/app/api/analytics/usage/route.ts', 'prisma.asset.count', 'usage reporting', 'authenticated Postgres query (intentional)'],
];

const RETIRED_PACKAGE_SCOPE = '@' + 'vercel/';
const FORBIDDEN_ADAPTERS = [
  new RegExp(`${RETIRED_PACKAGE_SCOPE}analytics`, 'i'),
  new RegExp(`${RETIRED_PACKAGE_SCOPE}speed-insights`, 'i'),
  /\/_vercel(?:\/|\b)/i,
];

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.json', '.lock', '.mjs', '.ts', '.tsx']);
const POLICY_FILES = new Set([
  'scripts/check-telemetry-inventory.mjs',
  'scripts/check-telemetry-inventory.test.mjs',
]);

export function findTelemetryInventoryViolations(files) {
  const violations = [];
  for (const { path, content } of files) {
    if (POLICY_FILES.has(path)) continue;
    if (!SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) continue;
    for (const pattern of FORBIDDEN_ADAPTERS) {
      const match = content.split(/\r?\n/).findIndex((line) => pattern.test(line));
      if (match !== -1) violations.push({ path, line: match + 1, rule: pattern.source });
    }
  }

  const webPackage = files.find(({ path }) => path === 'apps/web/package.json');
  if (webPackage) {
    for (const dependency of [
      `${RETIRED_PACKAGE_SCOPE}analytics`,
      `${RETIRED_PACKAGE_SCOPE}speed-insights`,
    ]) {
      if (new RegExp(`['"]${dependency.replace('/', '\\/')}['"]`).test(webPackage.content)) {
        violations.push({ path: webPackage.path, line: 1, rule: `retired dependency ${dependency}` });
      }
    }
  }
  return violations;
}

export function findInventoryDocumentationGaps(files) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  return TELEMETRY_PRODUCER_INVENTORY
    .filter(([path, marker]) => !byPath.has(path) || !byPath.get(path).includes(marker))
    .map(([path, marker]) => ({ path, line: 1, rule: `missing inventory marker ${marker}` }));
}

export function findBundleTelemetryViolations(contents) {
  return findTelemetryInventoryViolations([{ path: 'bundle.js', content: contents }]);
}

function repositoryFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean).filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

function bundleFiles(directory) {
  if (!directory || !existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...bundleFiles(path));
    else if (entry.isFile() && /\.js$/.test(entry.name)) files.push({ path: relative(process.cwd(), path), content: readFileSync(path, 'utf8') });
  }
  return files;
}

function main() {
  const bundleIndex = process.argv.indexOf('--bundle-dir');
  const bundleDir = bundleIndex === -1 ? undefined : process.argv[bundleIndex + 1];
  const files = repositoryFiles();
  const violations = [
    ...findTelemetryInventoryViolations(files),
    ...findInventoryDocumentationGaps(files),
    ...bundleFiles(bundleDir).flatMap(({ path, content }) => findBundleTelemetryViolations(content).map((violation) => ({ ...violation, path }))),
  ];
  if (violations.length) {
    console.error('telemetry inventory check failed:');
    for (const violation of violations) console.error(`- ${violation.path}:${violation.line} ${violation.rule}`);
    process.exitCode = 1;
    return;
  }
  console.log(`telemetry inventory check passed (${TELEMETRY_PRODUCER_INVENTORY.length} classified producers)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
