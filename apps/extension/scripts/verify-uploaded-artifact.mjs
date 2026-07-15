#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertReleaseArtifact } from './release-provenance.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(process.env.RELEASE_ARTIFACT_ROOT ?? process.argv[2] ?? '.');
const expectedCandidateSha = process.env.RELEASE_CANDIDATE_SHA;
const names = {
  zip: 'extension-1.0.0-chrome.zip',
  marker: 'release-build-provenance.json',
  provenance: 'extension-1.0.0-chrome.provenance.json',
};

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

const files = await filesUnder(root);
const find = name => files.find(file => path.basename(file) === name);
const zipPath = find(names.zip);
const markerPath = find(names.marker);
const provenancePath = find(names.provenance);
if (!zipPath || !markerPath || !provenancePath) {
  throw new Error(`uploaded extension artifact is incomplete: ${JSON.stringify({ zipPath, markerPath, provenancePath })}`);
}

const artifactSha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD']);
const candidateSha = stdout.trim();
const buildMarker = JSON.parse(await readFile(markerPath, 'utf8'));
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
assertReleaseArtifact({
  candidateSha,
  expectedCandidateSha,
  artifactPath: 'dist/extension-1.0.0-chrome.zip',
  artifactSha256,
  buildMarker,
  provenance,
  version: '1.0.0',
});

const { stdout: manifestJson } = await execFileAsync('unzip', ['-p', zipPath, 'manifest.json']);
const manifest = JSON.parse(manifestJson);
if (manifest.version !== '1.0.0' || manifest.manifest_version !== 3) {
  throw new Error('uploaded extension artifact manifest version or MV3 binding drifted');
}

console.log(`uploaded extension artifact verified: ${names.zip} sha256=${artifactSha256} candidate=${candidateSha}`);
