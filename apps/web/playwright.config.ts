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
          ...(publicTruthMode ? { SPLOOT_PUBLIC_TRUTH_E2E_BUILD: 'true' } : {}),
          PORT: String(port),
          SPLOOT_QA_AUTH_MODE: 'enabled',
          SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
          SPLOOT_QA_DEPLOYMENT_AUDIENCE: 'sploot-gallery-evidence',
          DEPLOYMENT_ENV: 'qa-local',
          SPLOOT_QA_EVIDENCE_MODE: 'enabled',
          NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
          NEXT_PUBLIC_SPLOOT_QA_EVIDENCE_MODE: 'enabled',
          NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: 'sploot-gallery-qa-local',
          SPLOOT_QA_AUTH_SECRET: qaSecret,
        },
      },
});
