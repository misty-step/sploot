import { defineConfig, devices } from '@playwright/test';

const selectedProject = process.env.PLAYWRIGHT_PROJECT ?? (() => {
  const index = process.argv.findIndex((arg) => arg === '--project');
  return process.argv.find((arg) => arg.startsWith('--project='))?.slice('--project='.length) ??
    (index >= 0 ? process.argv[index + 1] : undefined);
})();
const isQueueProject = selectedProject === 'queue';
const isAuthProject = selectedProject === 'auth';
const isPortableTelemetryProject = selectedProject === 'portable-telemetry';
const port = isQueueProject
  ? Number(process.env.PLAYWRIGHT_QUEUE_PORT ?? 3138)
  : isAuthProject || isPortableTelemetryProject
    ? Number(process.env.PLAYWRIGHT_AUTH_PORT ?? 3139)
    : Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:' + port;
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const commandArgs = process.argv.slice(2);
const authProjectSelected = isAuthProject || isPortableTelemetryProject || commandArgs.some((arg, index) =>
  arg === '--project=auth' || (arg === '--project' && commandArgs[index + 1] === 'auth')
) || process.env.SPLOOT_QA_AUTH_MODE === 'enabled';
const authWebServerEnv: Record<string, string> = authProjectSelected ? {
  DEPLOYMENT_ENV: 'local-qa',
  SPLOOT_PWA_CAPTURE_MODE: 'enabled',
  SPLOOT_QA_DEPLOYMENT_ID: 'local-pwa-capture-v1',
  SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
  SPLOOT_QA_AUDIENCE: 'sploot-pwa-capture',
  SPLOOT_QA_BIND_HOST: '127.0.0.1',
  SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
  NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
  NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE: 'enabled',
} : {};
const webServerCommand = authProjectSelected
  ? 'pnpm --filter web build && PORT=' + port + ' pnpm --filter web start --hostname 127.0.0.1'
  : 'pnpm e2e:public-truth:serve';
const webServerUrl = authProjectSelected ? baseURL + '/api/health/live' : baseURL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  use: {
    baseURL,
    // A deterministic signed-out Clerk development cookie prevents the SDK's
    // browser handshake from leaving the local test server. It is only a
    // network fixture: it is not an authentication credential, never enables
    // a signed-in session, and is not the protected-route security oracle.
    storageState: {
      cookies: [{ name: '__clerk_db_jwt', value: 'public-truth-signed-out', domain: '127.0.0.1', path: '/', expires: 0, httpOnly: false, secure: false, sameSite: 'Lax' }],
      origins: [],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'public-truth',
      testMatch: /public-truth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'queue',
      testMatch: /upload-queue\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'portable-telemetry',
      testMatch: /portable-telemetry\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Gallery's qa:gallery gate (scripts/qa-gallery-gate.mjs) manages its
      // own standalone/loopback server externally and drives this project
      // directly with PLAYWRIGHT_BASE_URL set, so no webServer wiring here.
      name: 'gallery',
      testMatch: /gallery\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Queue and auth fixtures own their child server (including production
  // builds in CI), so Playwright must not race them with another server.
  // Portable telemetry uses the production-start server contract;
  // public-truth retains a managed server for its signed-out artifact.
  // Gallery's qa:gallery gate manages its own standalone/loopback server
  // externally and always sets PLAYWRIGHT_BASE_URL.
  webServer: isQueueProject || isAuthProject || process.env.PLAYWRIGHT_EXTERNAL_SERVER || process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: webServerCommand,
    url: webServerUrl,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...process.env,
      ...authWebServerEnv,
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
