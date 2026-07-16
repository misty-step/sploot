import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:' + port;
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const commandArgs = process.argv.slice(2);
const authProjectSelected = commandArgs.some((arg, index) =>
  arg === '--project=auth' || (arg === '--project' && commandArgs[index + 1] === 'auth')
) || process.env.SPLOOT_QA_AUTH_MODE === 'enabled';
const webServerCommand = authProjectSelected
  ? 'pnpm --filter web build && PORT=' + port + ' pnpm --filter web start --hostname 0.0.0.0'
  : 'pnpm e2e:public-truth:serve';
const webServerUrl = authProjectSelected ? baseURL + '/api/health/live' : baseURL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    // The public-truth project uses a deterministic signed-out Clerk cookie.
    // It is a network fixture, never an authentication credential.
    storageState: {
      cookies: [{ name: '__clerk_db_jwt', value: 'public-truth-signed-out', domain: '127.0.0.1', path: '/', expires: 0, httpOnly: false, secure: false, sameSite: 'Lax' }],
      origins: [],
    },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'public-truth',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth',
      testMatch: '**/portable-telemetry.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: webServerUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NO_PROXY: [process.env.NO_PROXY, 'localhost', '127.0.0.1'].filter(Boolean).join(','),
      no_proxy: [process.env.no_proxy, 'localhost', '127.0.0.1'].filter(Boolean).join(','),
      PORT: String(port),
      SPLOOT_DEPLOYMENT_ENV: authProjectSelected ? 'development' : (process.env.SPLOOT_DEPLOYMENT_ENV ?? 'test'),
      SPLOOT_ENROLLMENT_MODE: authProjectSelected ? 'ga' : (process.env.SPLOOT_ENROLLMENT_MODE ?? 'closed'),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_public-truth-ci-only',
      SPLOOT_PUBLIC_TRUTH_E2E_BUILD: authProjectSelected ? 'false' : 'true',
      NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD: authProjectSelected ? 'true' : (process.env.NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD ?? 'false'),
      SPLOOT_QA_AUTH_MODE: authProjectSelected ? 'enabled' : (process.env.SPLOOT_QA_AUTH_MODE ?? 'disabled'),
      SPLOOT_QA_AUTH_SECRET: qaSecret,
      NEXT_PUBLIC_TELEMETRY_ENABLED: 'true',
      NEXT_PUBLIC_TELEMETRY_ENDPOINT: '/api/telemetry',
    },
  },
});
