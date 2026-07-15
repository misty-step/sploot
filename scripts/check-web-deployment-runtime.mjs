import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');

export function validateWebDeploymentRuntime({
  webPackage = readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'),
  nextConfig = readFileSync(resolve(root, 'apps/web/next.config.ts'), 'utf8'),
  homePage = readFileSync(resolve(root, 'apps/web/app/page.tsx'), 'utf8'),
  migrator = readFileSync(resolve(root, 'apps/web/scripts/migrate-deploy.mjs'), 'utf8'),
  workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'),
  providerTransaction = readFileSync(resolve(root, 'apps/web/scripts/deployment-provider-transaction.mjs'), 'utf8'),
  secretlessBuilder = readFileSync(resolve(root, 'scripts/build-web-without-runtime-secrets.mjs'), 'utf8'),
} = {}) {
  const failures = [];
  const manifest = JSON.parse(webPackage);
  const build = manifest.scripts?.build ?? '';
  const start = manifest.scripts?.start ?? '';

  if (build !== 'next build --webpack') {
    failures.push('web build must be compilation-only: next build --webpack');
  }
  if (/migrate|validate:env/.test(build)) {
    failures.push('web build must not require runtime validation or database migration');
  }
  if (start !== 'next start') {
    failures.push('source deployment must use the plain next start command');
  }
  const hasLoopbackQaStandaloneGate =
    /SPLOOT_QA_AUTH_MODE\s*===\s*['"]enabled['"][\s\S]*SPLOOT_QA_EVIDENCE_MODE\s*===\s*['"]enabled['"][\s\S]*SPLOOT_QA_DEPLOYMENT_ID[\s\S]*sploot-gallery-qa-local[\s\S]*SPLOOT_QA_DEPLOYMENT_AUDIENCE[\s\S]*sploot-gallery-evidence[\s\S]*DEPLOYMENT_ENV\s*===\s*['"]qa-local['"]/.test(nextConfig);
  if (/output\s*:\s*["']standalone["']/.test(nextConfig) && !hasLoopbackQaStandaloneGate) {
    failures.push('standalone output is incompatible with the source-based next start contract');
  }
  if (/getAuth\s*\(/.test(homePage) && !/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(homePage)) {
    failures.push('the request-authenticated home page must opt out of build-time prerendering');
  }
  if (!/DATABASE_URL is required; refusing to start without migrations/.test(migrator)) {
    failures.push('the dedicated migration runner must fail closed without DATABASE_URL');
  }
  if (/migrate-prod|PRODUCTION_DATABASE_URL/.test(workflow)) {
    failures.push('GitHub Actions must not own a second production migration path');
  }
  if (!/web-build:[\s\S]*Build without runtime database or provider secrets[\s\S]*pnpm deployment:build/.test(workflow)) {
    failures.push('CI must execute the production web build without runtime bindings');
  }
  if (!/merge-gate:[\s\S]*needs:\s*\[[^\]]*web-build/.test(workflow)) {
    failures.push('the production web build must be required by merge-gate');
  }
  if (!/MIGRATION_JOB_NAME\s*=\s*['"]web-pre-deploy-migrate['"][\s\S]*MIGRATION_JOB_KIND\s*=\s*['"]PRE_DEPLOY['"][\s\S]*SERVICE_RUN_COMMAND\s*=\s*['"]pnpm --filter web start['"][\s\S]*MIGRATION_BUILD_COMMAND\s*=\s*['"]corepack enable && pnpm install --frozen-lockfile && pnpm --filter web exec prisma generate['"][\s\S]*MIGRATION_RUN_COMMAND\s*=\s*['"]pnpm --filter web exec node scripts\/migrate-deploy\.mjs['"]/.test(providerTransaction)) {
    failures.push('the provider transaction must own one migration-only PRE_DEPLOY component and a start-only service');
  }
  if (!/DENIED_RUNTIME_BINDINGS[\s\S]*createWebBuildEnvironment[\s\S]*spawnSync\(['"]pnpm['"],\s*\[['"]--filter['"],\s*['"]web['"],\s*['"]build['"]\]/.test(secretlessBuilder)) {
    failures.push('the CI builder must use an explicit runtime-secret-denied environment');
  }

  return failures;
}

export function formatFailures(failures) {
  return failures.length === 0
    ? 'web deployment runtime contract passed'
    : ['web deployment runtime contract failed:', ...failures.map(failure => `- ${failure}`)].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const failures = validateWebDeploymentRuntime();
  if (failures.length > 0) {
    console.error(formatFailures(failures));
    process.exitCode = 1;
  } else {
    console.log(formatFailures(failures));
  }
}
