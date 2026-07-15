#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { validateManifest } from './manifest-policy.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const zipPath = path.resolve(root, 'dist/extension-1.0.0-chrome.zip');
const listingPath = path.resolve(root, 'STORE_LISTING.md');
const screenshotDir = path.resolve(root, 'store-assets/screenshots');
const promoDir = path.resolve(root, 'store-assets/promo');

const pass = [];
const localBlockers = [];
const externalBlockers = [];

function rel(filePath) {
  return path.relative(root, filePath);
}

function recordPass(message) {
  pass.push(message);
}

function recordLocal(message) {
  localBlockers.push(message);
}

function recordExternal(message) {
  externalBlockers.push(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');

  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });

  return hash.digest('hex');
}

async function zipEntry(zipFile, entryName) {
  const { stdout } = await execFileAsync('unzip', ['-p', zipFile, entryName], {
    maxBuffer: 20 * 1024 * 1024,
  });

  if (!stdout) {
    throw new Error(`missing ${entryName}`);
  }

  return stdout;
}

async function zipEntries(zipFile) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipFile], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return stdout
    .split('\n')
    .map(entry => entry.trim())
    .filter(Boolean);
}

async function validateZip() {
  if (!existsSync(zipPath)) {
    recordLocal(`missing release zip: ${rel(zipPath)}`);
    return;
  }

  if (existsSync(listingPath)) {
    const listing = await readFile(listingPath, 'utf8');
    const documentedSha = listing.match(/SHA256:\s*([a-f0-9]{64})/i)?.[1]?.toLowerCase();
    const actualSha = await sha256File(zipPath);

    if (!documentedSha) {
      recordLocal('listing packet missing release zip SHA256');
    } else if (documentedSha !== actualSha) {
      recordLocal(`release zip SHA256 mismatch: listing has ${documentedSha}, actual is ${actualSha}`);
    } else {
      recordPass(`release zip SHA256 matches STORE_LISTING.md (${actualSha})`);
    }
  }

  const entries = await zipEntries(zipPath);
  const entrySet = new Set(entries);
  const requiredEntries = ['manifest.json', 'popup.html', 'background.js'];

  for (const entry of requiredEntries) {
    if (!entrySet.has(entry)) {
      recordLocal(`release zip missing ${entry}`);
    }
  }

  if (!entrySet.has('manifest.json')) {
    return;
  }

  const manifest = JSON.parse(await zipEntry(zipPath, 'manifest.json'));
  for (const error of validateManifest(manifest, { production: true })) {
    recordLocal(`release zip manifest ${error}`);
  }

  const javascriptBundle = (
    await Promise.all(
      entries
        .filter(entry => entry.endsWith('.js'))
        .map(entry => zipEntry(zipPath, entry))
    )
  ).join('\n');

  if (!/pk_live_[A-Za-z0-9_-]{20,}/.test(javascriptBundle)) {
    recordLocal('release zip JavaScript does not contain a live Clerk publishable key');
  }

  if (/pk_test_[A-Za-z0-9_-]{20,}/.test(javascriptBundle)) {
    recordLocal('release zip JavaScript contains a test Clerk publishable key');
  }

  if (localBlockers.length === 0) {
    recordPass(`${rel(zipPath)} is a production-shaped 1.0.0 Chrome zip`);
  }
}

async function listAssetFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listAssetFiles(entryPath));
    } else if (entry.isFile() && entry.name !== '.gitkeep') {
      files.push(entryPath);
    }
  }

  return files;
}

async function validateImages(directory, allowedSizes, label) {
  const files = await listAssetFiles(directory);

  if (files.length === 0) {
    recordLocal(`missing ${label} asset in ${rel(directory)}`);
    return;
  }

  let valid = 0;
  const expected = allowedSizes.map(size => `${size.width}x${size.height}`).join(' or ');

  for (const file of files) {
    const fileStat = await stat(file);
    if (fileStat.size === 0) {
      recordLocal(`${label} asset is empty: ${rel(file)}`);
      continue;
    }

    try {
      const metadata = await sharp(file).metadata();
      const actual = `${metadata.width}x${metadata.height}`;
      const sizeOk = allowedSizes.some(size => (
        metadata.width === size.width && metadata.height === size.height
      ));

      if (!sizeOk) {
        recordLocal(`${label} asset ${rel(file)} is ${actual}, expected ${expected}`);
        continue;
      }

      valid += 1;
    } catch (error) {
      recordLocal(`${label} asset ${rel(file)} is not a readable image: ${error.message}`);
    }
  }

  if (valid > 0) {
    recordPass(`${valid} ${label} asset(s) match ${expected}`);
  }
}

async function validateListing() {
  if (!existsSync(listingPath)) {
    recordLocal(`missing listing packet: ${rel(listingPath)}`);
    return;
  }

  const listing = await readFile(listingPath, 'utf8');
  const requiredSnippets = [
    'https://www.sploot.app/support',
    'https://www.sploot.app/privacy',
    'Host permission: `*://*/*`',
    'Host permission: `https://clerk.sploot.app/*`',
  ];

  for (const snippet of requiredSnippets) {
    if (!listing.includes(snippet)) {
      recordLocal(`listing packet missing required text: ${snippet}`);
    }
  }

  if (listing.includes('right-click upload and duplicate behavior are not release-proven')) {
    recordExternal('authenticated right-click upload and duplicate behavior still need release proof');
  }

  if (listing.includes('no Chrome Web Store dashboard upload/review receipt has been captured')) {
    recordExternal('Chrome Web Store dashboard upload/review receipt still needs capture');
  }

  if (/installed extension\s+source is stale/.test(listing)) {
    recordExternal('Chrome is signed in but loaded from stale extension source; reload apps/extension/dist/chrome-mv3 before release QA');
  }

  if (/Status: (not submitted|submitted for review)\./.test(listing)) {
    recordPass('listing packet records current Web Store submission status');
  } else {
    recordLocal('listing packet missing current Web Store submission status');
  }
}

function printSection(title, items) {
  console.log(`\n${title}`);
  if (items.length === 0) {
    console.log('- none');
    return;
  }

  for (const item of items) {
    console.log(`- ${item}`);
  }
}

await validateZip();
await validateImages(screenshotDir, [
  { width: 1280, height: 800 },
  { width: 640, height: 400 },
], 'screenshot');
await validateImages(promoDir, [
  { width: 440, height: 280 },
], 'small promo tile');
await validateListing();

printSection('pass', pass);
printSection('local blockers', localBlockers);
printSection('external blockers', externalBlockers);

if (localBlockers.length > 0 || externalBlockers.length > 0) {
  process.exitCode = 1;
}
