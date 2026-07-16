import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3108);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const serverMode = process.env.PLAYWRIGHT_SERVER_MODE ?? 'production';
const publicTruthMode = process.env.SPLOOT_PUBLIC_TRUTH_E2E_BUILD === 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    ...(publicTruthMode ? {
      // Deterministic signed-out Clerk fixture prevents a provider handshake; it is not auth.
      storageState: {
        cookies: [{ name: '__clerk_db_jwt', value: 'public-truth-signed-out', domain: '127.0.0.1', path: '/', expires: 0, httpOnly: false, secure: false, sameSite: 'Lax' }],
        origins: [],
      },
    } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: publicTruthMode
          ? 'pnpm e2e:public-truth:serve'
          : serverMode === 'production'
            ? `PORT=${port} QA_NEXT_PORT=${port + 1} node scripts/qa-evidence-server.mjs`
            : `PORT=${port} pnpm dev`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: String(port),
          ...(publicTruthMode ? {
            SPLOOT_ENROLLMENT_MODE: process.env.SPLOOT_ENROLLMENT_MODE ?? 'closed',
            SPLOOT_QA_AUTH_MODE: process.env.SPLOOT_QA_AUTH_MODE ?? 'disabled',
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
            CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_public-truth-ci-only',
            SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true',
          } : {
            SPLOOT_QA_AUTH_MODE: 'enabled',
            SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
            SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
            DEPLOYMENT_ENV: 'qa-local',
            SPLOOT_QA_EVIDENCE_MODE: 'enabled',
            NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
            NEXT_PUBLIC_SPLOOT_QA_EVIDENCE_MODE: 'enabled',
            NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
            SPLOOT_QA_AUTH_SECRET: qaSecret,
          }),
        },
      },
});
