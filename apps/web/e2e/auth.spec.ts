import { get as httpGet } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test as base } from '@playwright/test';
import { join } from 'node:path';

type AuthFixture = { stop: () => Promise<void> };

function readChildOutput(child: ChildProcess) {
  let output = '';
  const append = (chunk: Buffer | string) => { output = (output + chunk.toString()).slice(-12_000); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return () => output;
}

async function startAuthServer(): Promise<AuthFixture> {
  const port = Number(process.env.PLAYWRIGHT_AUTH_PORT ?? 3139);
  const baseURL = `http://127.0.0.1:${port}`;
  const mode = process.env.PLAYWRIGHT_FIXTURE_SERVER_MODE === 'production' ? 'start' : 'dev';
  const child = spawn('pnpm', ['--filter', 'web', mode], {
    cwd: join(__dirname, '../../..'),
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      SPLOOT_DEPLOYMENT_ENV: 'test',
      DEPLOYMENT_ENV: 'local-qa',
      SPLOOT_QA_AUTH_MODE: 'enabled',
      SPLOOT_PWA_CAPTURE_MODE: 'enabled',
      SPLOOT_QA_DEPLOYMENT_ID: 'local-pwa-capture-v1',
      SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
      SPLOOT_QA_AUDIENCE: 'sploot-pwa-capture',
      SPLOOT_QA_BIND_HOST: '127.0.0.1',
      SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
      SPLOOT_QA_AUTH_SECRET: qaSecret,
      NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
      NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD: 'true',
      NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE: 'enabled',
      NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: 'local-pwa-capture-v1',
      NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
      NEXT_PUBLIC_SPLOOT_QA_AUDIENCE: 'sploot-pwa-capture',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_MTI3LjAuMC4xOjMxMzkk',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? 'sk_test_auth_qa_local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = readChildOutput(child);
  try {
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`auth server exited: ${output()}`);
      try {
        const status = await new Promise<number>((resolve, reject) => {
          const request = httpGet(`${baseURL}/api/health`, (response) => { response.resume(); response.once('end', () => resolve(response.statusCode ?? 0)); });
          request.setTimeout(10_000, () => request.destroy(new Error('health timeout')));
          request.once('error', reject);
        });
        if (status === 200) { ready = true; break; }
      } catch { /* retry until the child is ready */ }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (child.exitCode !== null) throw new Error(`auth server exited: ${output()}`);
    if (!ready) throw new Error(`auth server did not become ready: ${output()}`);
    return {
      stop: async () => {
        if (child.exitCode !== null) return;
        try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch { /* already exited */ }
        await new Promise<void>((resolve) => child.once('exit', () => resolve()));
      },
    };
  } catch (error) {
    try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch { /* already exited */ }
    throw error;
  }
}

const test = base.extend<{ authFixture: AuthFixture }>({
  authFixture: [async ({}, use) => { const fixture = await startAuthServer(); await use(fixture); await fixture.stop(); }, { scope: 'worker', auto: true }],
});
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';

const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';

test('qa-local principal can open /app without manual Clerk login', async ({ browser, baseURL }) => {
  const token = await createQaLocalAuthToken({
    userId: 'qa-playwright-user',
    email: 'qa-playwright-user@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: {
      [getQaLocalAuthHeader()]: token,
    },
  });
  const page = await context.newPage();

  await page.goto('/app', { waitUntil: 'domcontentloaded', timeout: 75_000 });

  await expect(page).toHaveURL(/\/app/);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(page.locator('body')).not.toContainText('Sign in');

  await context.close();
});
