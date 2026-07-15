import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFailures, validateWebDeploymentRuntime } from './check-web-deployment-runtime.mjs';
import { createWebBuildEnvironment } from './build-web-without-runtime-secrets.mjs';

test('the production builder does not inherit runtime credentials', () => {
  const environment = createWebBuildEnvironment({
    PATH: '/usr/bin',
    HOME: '/tmp',
    DATABASE_URL: 'must-not-survive',
    CLERK_SECRET_KEY: 'must-not-survive',
    ARBITRARY_PARENT_SECRET: 'must-not-survive',
  });

  assert.equal(environment.DATABASE_URL, '');
  assert.equal(environment.CLERK_SECRET_KEY, '');
  assert.equal(environment.ARBITRARY_PARENT_SECRET, undefined);
  assert.match(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, /^pk_test_[A-Za-z0-9_-]+$/);
});

test('the checked-in web deployment runtime is build-time secret independent', () => {
  assert.deepEqual(validateWebDeploymentRuntime(), []);
});

test('the contract rejects migration at build time and mismatched standalone output', () => {
  const failures = validateWebDeploymentRuntime({
    webPackage: JSON.stringify({
      scripts: {
        build: 'pnpm validate:env && node scripts/migrate-deploy.mjs && next build --webpack',
        start: 'next start',
      },
    }),
    nextConfig: 'const nextConfig = { output: "standalone" };',
    homePage: 'export default async function Home() { return getAuth(); }',
    migrator: 'if (!process.env.DATABASE_URL) return;',
    workflow: 'migrate-prod: PRODUCTION_DATABASE_URL',
    providerTransaction: 'const job = "build";',
    secretlessBuilder: 'spawnSync("pnpm", ["build"]);',
  });

  assert.match(formatFailures(failures), /compilation-only/);
  assert.match(formatFailures(failures), /must not require runtime validation or database migration/);
  assert.match(formatFailures(failures), /standalone output is incompatible/);
  assert.match(formatFailures(failures), /must opt out of build-time prerendering/);
  assert.match(formatFailures(failures), /migration runner must fail closed/);
  assert.match(formatFailures(failures), /must not own a second production migration path/);
  assert.match(formatFailures(failures), /CI must execute the production web build/);
  assert.match(formatFailures(failures), /must be required by merge-gate/);
  assert.match(formatFailures(failures), /provider transaction must own one PRE_DEPLOY migrator/);
  assert.match(formatFailures(failures), /explicit runtime-secret-denied environment/);
});
