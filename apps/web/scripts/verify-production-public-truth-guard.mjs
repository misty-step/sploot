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

rmSync(resolve(webRoot, distDir), { recursive: true, force: true });
const production = runBuild({
  ...process.env,
  NODE_ENV: 'production',
  SPLOOT_DEPLOYMENT_ENV: 'production',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('clerk.example.com$').toString('base64url')}`,
  SPLOOT_PUBLIC_TRUTH_E2E_BUILD: undefined,
  NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E: undefined,
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

const omissionInBundle = bundleFiles(bundleRoot).some((path) => {
  if (path.endsWith('.map')) return false;
  if (statSync(path).size > 10 * 1024 * 1024) return false;
  const source = readFileSync(path, 'utf8');
  return /NEXT_PUBLIC_SPLOOT_PUBLIC_TRUTH_E2E["':= ]{1,6}["']?true/.test(source);
});

if (omissionInBundle) {
  throw new Error('compiled production bundle contains an enabled public-truth omission');
}

console.log(`production public-truth guard passed: ${execFileSync('cat', [resolve(bundleRoot, 'BUILD_ID')], { encoding: 'utf8' }).trim()}`);
