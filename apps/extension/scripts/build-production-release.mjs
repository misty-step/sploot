import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { createReleaseProvenance } from './release-provenance.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const zipPath = path.resolve(root, 'dist/extension-1.0.0-chrome.zip');
const markerPath = path.resolve(root, 'dist/release-build-provenance.json');

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

const { stdout: beforeBuildSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
await rm(zipPath, { force: true });
await rm(markerPath, { force: true });
await execFileAsync('wxt', ['zip'], { cwd: root, env: process.env, stdio: 'inherit' });
await execFileAsync(process.execPath, ['scripts/assert-update-nag-artifact.mjs'], { cwd: root, env: process.env, stdio: 'inherit' });

const { stdout: afterBuildSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
if (beforeBuildSha.trim() !== afterBuildSha.trim()) {
  throw new Error(`source changed during release build: ${beforeBuildSha.trim()} -> ${afterBuildSha.trim()}`);
}

const provenance = createReleaseProvenance({
  candidateSha: afterBuildSha.trim(),
  artifactPath: path.relative(root, zipPath),
  artifactSha256: await sha256File(zipPath),
  version: '1.0.0',
});
await writeFile(markerPath, `${JSON.stringify(provenance, null, 2)}\n`);
