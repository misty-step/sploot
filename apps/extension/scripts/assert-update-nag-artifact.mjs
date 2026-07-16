#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'dist/chrome-mv3');
const requiredUi = [
  'Update available',
  'Dismiss Sploot update ',
];
const requiredMessages = [
  'sploot:update-status:get-status',
  'sploot:update-status:dismiss',
  'sploot:update-status:request-check',
];
const forbidden = [
  'sploot:update-status:test-set-available',
  'sploot:update-status:test-set-installed',
  'sploot:e2e-auth-authority',
  'VITE_E2E_AUTH_MODE',
];
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('.js')) files.push(file);
  }
}
await walk(root);
const bundle = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
const popupFiles = files.filter(file => path.basename(file).startsWith('popup-'));
const popupBundle = (await Promise.all(popupFiles.map(file => readFile(file, 'utf8')))).join('\n');
const missingUi = requiredUi.filter(value => !popupBundle.includes(value));
const missingMessages = requiredMessages.filter(value => !bundle.includes(value));
const missing = [...missingUi, ...missingMessages];
const leaked = forbidden.filter(value => bundle.includes(value));
if (/pk_test_[A-Za-z0-9_-]{20,}/.test(bundle)) leaked.push('pk_test_actual');
if (missing.length || leaked.length) {
  console.error(JSON.stringify({ root, missing, leaked }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ root, files: files.map(file => path.relative(root, file)), requiredUi, requiredMessages, missingUi: [], missingMessages: [], leaked: [] }, null, 2));
