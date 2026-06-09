import { expect, test } from '@playwright/test';
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
