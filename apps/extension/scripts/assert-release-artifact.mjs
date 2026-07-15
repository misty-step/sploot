#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertReleaseArtifact } from './release-provenance.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const zipPath = path.resolve(root, process.env.RELEASE_ZIP_PATH ?? 'dist/extension-1.0.0-chrome.zip');
const markerPath = path.resolve(root, 'dist/release-build-provenance.json');
const provenancePath = path.resolve(
  process.env.RELEASE_PROVENANCE_PATH ?? 'dist/extension-1.0.0-chrome.provenance.json'
);

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

for (const filePath of [zipPath, markerPath, provenancePath]) {
  if (!existsSync(filePath)) {
    throw new Error(`missing production release proof file: ${path.relative(root, filePath)}`);
  }
}

const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
const candidateSha = stdout.trim();
const artifactPath = path.relative(root, zipPath);
const artifactSha256 = await sha256File(zipPath);
const buildMarker = JSON.parse(await readFile(markerPath, 'utf8'));
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));

assertReleaseArtifact({
  candidateSha,
  expectedCandidateSha: process.env.RELEASE_CANDIDATE_SHA,
  artifactPath,
  artifactSha256,
  buildMarker,
  provenance,
  version: '1.0.0',
});

console.log(`production ZIP/provenance unchanged: ${artifactPath} sha256=${artifactSha256}`);
