import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
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
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm e2e:public-truth:serve',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      SPLOOT_DEPLOYMENT_ENV: process.env.SPLOOT_DEPLOYMENT_ENV ?? 'test',
      SPLOOT_ENROLLMENT_MODE: process.env.SPLOOT_ENROLLMENT_MODE ?? 'closed',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_public-truth-ci-only',
      SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true',
      SPLOOT_QA_AUTH_MODE: process.env.SPLOOT_QA_AUTH_MODE ?? 'disabled',
      SPLOOT_QA_AUTH_SECRET: qaSecret,
      NEXT_PUBLIC_TELEMETRY_ENABLED: 'true',
      NEXT_PUBLIC_TELEMETRY_ENDPOINT: '/api/telemetry',
    },
  },
});
