#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateManifest } from './manifest-policy.mjs';

const manifestPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? 'dist/chrome-mv3/manifest.json'
);

try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const errors = validateManifest(manifest, { production: true });

  if (errors.length > 0) {
    console.error(`Manifest validation failed: ${manifestPath}`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Manifest validation passed: ${manifestPath}`);
  }
} catch (error) {
  console.error(`Unable to validate manifest ${manifestPath}: ${error.message}`);
  process.exitCode = 1;
}
