import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(webRoot, '../..');
const manifestPath = resolve(webRoot, '.next/public-truth-build.json');
const buildIdPath = resolve(webRoot, '.next/BUILD_ID');
const allowedDeployments = new Set(['test', 'evidence']);
const generatedTrackedArtifacts = new Set(['apps/web/public/workbox-0434ae86.js.map']);

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

if (!allowedDeployments.has(process.env.SPLOOT_DEPLOYMENT_ENV)) {
  throw new Error('public-truth serve requires SPLOOT_DEPLOYMENT_ENV=test or evidence');
}
if (process.env.SPLOOT_PUBLIC_TRUTH_E2E_BUILD !== 'true') {
  throw new Error('public-truth serve requires SPLOOT_PUBLIC_TRUTH_E2E_BUILD=true');
}
if (!existsSync(manifestPath) || !existsSync(buildIdPath)) {
  throw new Error('missing public-truth build manifest; run e2e:public-truth:build first');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (
  manifest.contract !== 'sploot-public-truth-v1' ||
  manifest.deploymentEnv !== process.env.SPLOOT_DEPLOYMENT_ENV ||
  manifest.e2eBuild !== true ||
  manifest.buildId !== readFileSync(buildIdPath, 'utf8').trim() ||
  manifest.sourceFingerprint !== sourceFingerprint()
) {
  throw new Error('stale or mismatched public-truth artifact; rebuild before browser proof');
}

const nextBin = resolve(webRoot, 'node_modules/next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1'], {
  cwd: webRoot,
  env: { ...process.env, NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: 'true' },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
