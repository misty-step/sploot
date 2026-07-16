import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(webRoot, '../..');
const manifestPath = resolve(webRoot, '.next/public-truth-build.json');
const allowedDeployments = new Set(['test', 'evidence']);
const generatedTrackedArtifacts = new Set(['apps/web/public/workbox-0434ae86.js.map']);

function requireEvidenceAuthority() {
  if (!allowedDeployments.has(process.env.SPLOOT_DEPLOYMENT_ENV) || process.env.SPLOOT_PUBLIC_TRUTH_E2E_BUILD !== 'true') {
    throw new Error('public-truth build requires SPLOOT_DEPLOYMENT_ENV=test or evidence and SPLOOT_PUBLIC_TRUTH_E2E_BUILD=true');
  }
}

function sourceFingerprint() {
  const paths = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: repoRoot })
    .toString()
    .split('\0')
    .filter((path) => path && !path.startsWith('.evidence/') && !path.startsWith('.next/') && !generatedTrackedArtifacts.has(path))
    .sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    if (!lstatSync(resolve(repoRoot, path)).isFile()) continue;
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(resolve(repoRoot, path)));
  }
  return hash.digest('hex');
}

requireEvidenceAuthority();
rmSync(manifestPath, { force: true });

const result = spawnSync('pnpm', ['exec', 'next', 'build', '--webpack'], {
  cwd: webRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const buildIdPath = resolve(webRoot, '.next/BUILD_ID');
if (!existsSync(buildIdPath)) throw new Error('next build completed without .next/BUILD_ID');

const manifest = {
  contract: 'sploot-public-truth-v1',
  deploymentEnv: process.env.SPLOOT_DEPLOYMENT_ENV,
  e2eBuild: true,
  buildId: readFileSync(buildIdPath, 'utf8').trim(),
  sourceFingerprint: sourceFingerprint(),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`public-truth artifact ${manifest.buildId} bound to ${manifest.sourceFingerprint}`);
