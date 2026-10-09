#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  const extensionPackage = files.find(({ path }) => path === 'apps/extension/package.json');
  if (extensionPackage && /"@clerk\/[^"]+"\s*:/.test(extensionPackage.content)) {
    violations.push({ path: extensionPackage.path, line: 1, rule: 'device-paired extension must not depend on Clerk' });
  }
  return violations;
}

export function bundleFiles(directory) {
  if (!directory) throw new Error('explicit --bundle-dir is missing a path');
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`explicit --bundle-dir does not exist: ${directory}`);
  }

  const files = [];
  collectBundleFiles(directory, files);
  if (files.length === 0) {
    throw new Error(`explicit --bundle-dir contains no JavaScript artifacts: ${directory}`);
  }
  return files;
}

function collectBundleFiles(directory, files) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectBundleFiles(path, files);
    else if (entry.isFile() && /\.js$/.test(entry.name)) {
      files.push({ path: relative(process.cwd(), path), content: readFileSync(path, 'utf8') });
    }
  }
}

export function findBundleTelemetryViolations(contents) {
  return findTelemetryInventoryViolations([{ path: 'bundle.js', content: contents }]);
}

function repositoryFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean).filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

function parseBundleDirectories(args) {
  const directories = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--bundle-dir') continue;
    const directory = args[index + 1];
    if (!directory || directory.startsWith('--')) {
      throw new Error('--bundle-dir requires a directory path');
    }
    directories.push(directory);
    index += 1;
  }
  return directories;
}

function main() {
  const bundleDirs = parseBundleDirectories(process.argv.slice(2));
  const files = repositoryFiles();
  const bundles = bundleDirs.flatMap((dir) => bundleFiles(dir));
  const violations = [
    ...findTelemetryInventoryViolations(files),
    ...bundles.flatMap(({ path, content }) => findBundleTelemetryViolations(content).map((violation) => ({ ...violation, path }))),
  ];
  if (violations.length) {
    console.error('telemetry inventory check failed:');
    for (const violation of violations) console.error(`- ${violation.path}:${violation.line} ${violation.rule}`);
    process.exitCode = 1;
    return;
  }
  console.log('telemetry inventory check passed (source and requested bundles omit retired adapters)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
