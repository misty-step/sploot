import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(webRoot, '../..');
const distDir = '.next/public-truth-production-guard';
const expectedGuardMessage = 'SPLOOT_PUBLIC_TRUTH_E2E_BUILD is test-only';

function runBuild(env) {
  const result = spawnSync('pnpm', ['--filter', 'web', 'exec', 'next', 'build', '--webpack'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { ...result, output };
}

const omission = runBuild({
  ...process.env,
  NODE_ENV: 'production',
  SPLOOT_DEPLOYMENT_ENV: 'production',
  SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true',
});

if (omission.status === 0 || !omission.output.includes(expectedGuardMessage)) {
  throw new Error(
    omission.status === 0
      ? 'production omission guard did not reject the test-only build flag'
      : `production omission guard failed for an unrelated reason; expected ${expectedGuardMessage}`,
  );
}

// A production-marked build must refuse the qa-local auth harness at config
// load, before any compilation could bake the seam in.
const qaOmission = runBuild({
  ...process.env,
  NODE_ENV: 'production',
  SPLOOT_DEPLOYMENT_ENV: 'production',
  SPLOOT_PUBLIC_TRUTH_E2E_BUILD: undefined,
  SPLOOT_QA_AUTH_MODE: 'enabled',
});

if (qaOmission.status === 0 || !qaOmission.output.includes('SPLOOT_QA_AUTH_MODE=enabled is dev/test-only')) {
  throw new Error(
    qaOmission.status === 0
      ? 'production omission guard did not reject the dev/test-only qa auth mode'
      : 'production omission guard failed for an unrelated reason; expected SPLOOT_QA_AUTH_MODE=enabled is dev/test-only',
  );
}

rmSync(resolve(webRoot, distDir), { recursive: true, force: true });
const production = runBuild({
  ...process.env,
  NODE_ENV: 'production',
  SPLOOT_DEPLOYMENT_ENV: 'production',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('clerk.example.com$').toString('base64url')}`,
  SPLOOT_PUBLIC_TRUTH_E2E_BUILD: undefined,
  NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: undefined,
  SPLOOT_QA_AUTH_MODE: undefined,
  NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD: undefined,
  NEXT_DIST_DIR: distDir,
});

if (production.status !== 0) {
  throw new Error('production bundle failed to compile without the test-only flag');
}

const bundleRoot = resolve(webRoot, distDir);
if (!existsSync(resolve(bundleRoot, 'BUILD_ID'))) {
  throw new Error('production bundle is missing BUILD_ID');
}

function bundleFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? bundleFiles(path) : [path];
  });
}

// QA-local auth must be ABSENT from the shipped artifact, not merely gated:
// these are the marker strings of the qa-local credential machinery (header,
// cookie, secret env, runtime-refusal reasons, terminal sync marker). Any hit
// in a production bundle means the seam survived dead-code elimination.
const qaLocalMarkers = [
  'x-sploot-qa-auth',
  'sploot_qa_auth',
  'SPLOOT_QA_AUTH_SECRET',
  'qa-local-disabled',
  'qa-local-invalid',
  'qa_auth_terminal',
];

const violations = [];
for (const path of bundleFiles(bundleRoot)) {
  if (path.endsWith('.map')) continue;
  if (statSync(path).size > 10 * 1024 * 1024) continue;
  const source = readFileSync(path, 'utf8');
  if (/NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E["':= ]{1,6}["']?true/.test(source)) {
    violations.push(`${path}: enabled public-truth omission`);
  }
  if (/NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD["':= ]{1,6}["']?true/.test(source)) {
    violations.push(`${path}: enabled qa-local auth build flag`);
  }
  for (const marker of qaLocalMarkers) {
    if (source.includes(marker)) {
      violations.push(`${path}: qa-local marker ${marker}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`compiled production bundle contains an enabled public-truth omission or qa-local auth residue:\n${violations.join('\n')}`);
}

console.log(`production public-truth guard passed: ${execFileSync('cat', [resolve(bundleRoot, 'BUILD_ID')], { encoding: 'utf8' }).trim()}`);
