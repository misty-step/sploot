#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { validateManifest } from './manifest-policy.mjs';
import {
  assertCandidateSha,
  createReleaseProvenance,
  validateOperatorEvidenceAt,
} from './release-provenance.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const zipPath = path.resolve(root, 'dist/extension-1.0.0-chrome.zip');
const listingPath = path.resolve(root, 'STORE_LISTING.md');
const screenshotDir = path.resolve(root, 'store-assets/screenshots');
const promoDir = path.resolve(root, 'store-assets/promo');
const buildMarkerPath = path.resolve(root, 'dist/release-build-provenance.json');
const provenancePath = path.resolve(
  process.env.RELEASE_PROVENANCE_PATH ?? 'dist/extension-1.0.0-chrome.provenance.json'
);
const operatorEvidencePath = path.resolve(
  process.env.RELEASE_OPERATOR_EVIDENCE_PATH ?? 'dist/extension-1.0.0-chrome.operator-evidence.json'
);
const structuralOnly = process.env.RELEASE_STRUCTURAL_ONLY === 'true';

const pass = [];
const localBlockers = [];
const externalBlockers = [];
const reportPath = process.env.RELEASE_REPORT_PATH
  ? path.resolve(process.env.RELEASE_REPORT_PATH)
  : undefined;
let releaseCandidateSha;
let releaseArtifactSha256;

async function checkedOutCandidateSha() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
  return stdout.trim();
}

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

  const actualSha = await sha256File(zipPath);
  const candidateSha = await checkedOutCandidateSha();
  releaseCandidateSha = candidateSha;
  releaseArtifactSha256 = actualSha;
  try {
    assertCandidateSha(candidateSha, process.env.RELEASE_CANDIDATE_SHA);
    if (!existsSync(buildMarkerPath)) {
      throw new Error(`missing release build provenance: ${rel(buildMarkerPath)}`);
    }
    const buildMarker = JSON.parse(await readFile(buildMarkerPath, 'utf8'));
    if (buildMarker.candidateSha !== candidateSha) {
      throw new Error(`release build candidate drift: marker has ${buildMarker.candidateSha}, checked out ${candidateSha}`);
    }
    if (buildMarker.artifact?.path !== rel(zipPath)) {
      throw new Error(`release build artifact path drift: marker has ${buildMarker.artifact?.path}, expected ${rel(zipPath)}`);
    }
    if (buildMarker.artifact?.sha256 !== actualSha) {
      throw new Error(`release build artifact drift: marker has ${buildMarker.artifact?.sha256}, actual is ${actualSha}`);
    }
    const provenance = createReleaseProvenance({
      candidateSha,
      artifactPath: rel(zipPath),
      artifactSha256: actualSha,
      version: '1.0.0',
    });
    await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    recordPass(`release provenance binds ${candidateSha} to ${actualSha}`);
  } catch (error) {
    recordLocal(error instanceof Error ? error.message : 'invalid release provenance');
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
  if (manifest.version !== '1.0.0') {
    recordLocal(`release zip version drift: expected 1.0.0, found ${manifest.version ?? 'missing'}`);
  }
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
  if (!listing.includes('Canonical submission packet for Sploot extension version `1.0.0`.')) {
    recordLocal('listing packet version does not match the release version 1.0.0');
  }
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

  if (/Status: (not submitted|submitted for review)\./.test(listing)) {
    recordPass('listing packet records current Web Store submission status');
  } else {
    recordLocal('listing packet missing current Web Store submission status');
  }
}

async function validateExternalEvidence() {
  if (structuralOnly) {
    recordPass('strict operator evidence gate intentionally not evaluated in structural mode');
    return;
  }

  if (!existsSync(operatorEvidencePath)) {
    recordExternal(`missing exact-provenance operator evidence: ${rel(operatorEvidencePath)}`);
    return;
  }

  try {
    const evidence = JSON.parse(await readFile(operatorEvidencePath, 'utf8'));
    const errors = validateOperatorEvidenceAt(evidence, {
      candidateSha: releaseCandidateSha,
      artifactPath: rel(zipPath),
      artifactSha256: releaseArtifactSha256,
      version: '1.0.0',
    }, { evidenceRoot: path.dirname(operatorEvidencePath) });
    for (const error of errors) {
      recordExternal(error);
    }
    if (errors.length === 0) {
      recordPass('operator evidence binds exact source, ZIP, version, Chrome item, and Web Store receipt/install proof');
    }
  } catch (error) {
    recordExternal(`invalid operator evidence: ${error instanceof Error ? error.message : String(error)}`);
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

try {
  await validateZip();
  await validateImages(screenshotDir, [
    { width: 1280, height: 800 },
    { width: 640, height: 400 },
  ], 'screenshot');
  await validateImages(promoDir, [
    { width: 440, height: 280 },
  ], 'small promo tile');
  await validateListing();
  await validateExternalEvidence();
} catch (error) {
  recordLocal(`release validator failed: ${error instanceof Error ? error.message : String(error)}`);
}

printSection('pass', pass);
printSection('local blockers', localBlockers);
printSection('external blockers', externalBlockers);

const verdict = localBlockers.length > 0
  ? 'local-validation-failed'
  : externalBlockers.length > 0
    ? (externalBlockers.length === 1 && externalBlockers[0].startsWith('missing exact-provenance operator evidence:')
      ? 'external-evidence-missing'
      : 'external-evidence-invalid')
    : 'pass';

if (reportPath) {
  await writeFile(reportPath, `${JSON.stringify({
    verdict,
    pass,
    localBlockers,
    externalBlockers,
    candidateSha: releaseCandidateSha,
    artifactSha256: releaseArtifactSha256,
  }, null, 2)}\n`);
}

if (verdict !== 'pass') {
  process.exitCode = verdict === 'external-evidence-missing' ? 2 : 1;
}
