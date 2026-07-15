import { expect, test, type Browser, type Page } from '@playwright/test';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';

const PUBLIC_PAGES = ['/', '/privacy', '/help', '/support', '/changelog'];
const RETIRED_REQUEST_PREFIX = '/' + '_vercel';
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';

function isRetiredProviderRequest(url: string): boolean {
  return url.includes(RETIRED_REQUEST_PREFIX) || /(?:analytics|speed[-_]?insights)/i.test(url);
}

async function assertPortablePage(page: Page, path: string) {
  const providerRequests: string[] = [];
  const consoleErrors: string[] = [];
  const onRequest = (request: { url(): string }) => {
    if (isRetiredProviderRequest(request.url())) providerRequests.push(request.url());
  };
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };

  page.on('request', onRequest);
  page.on('console', onConsole);
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Sploot/i);
    await page.waitForTimeout(1000);
    expect(providerRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    page.off('request', onRequest);
    page.off('console', onConsole);
  }
}

async function openAuthenticatedPage(browser: Browser, baseURL: string | undefined) {
  const token = await createQaLocalAuthToken({
    userId: 'qa-playwright-user',
    email: 'qa-playwright-user@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { [getQaLocalAuthHeader()]: token },
  });
  return { context, page: await context.newPage() };
}

test('production public pages stay provider-portable and console-clean', async ({ page }) => {
  for (const path of PUBLIC_PAGES) await assertPortablePage(page, path);
});

test('qa-local authenticated product flow emits an actual telemetry POST', async ({ browser, baseURL }) => {
  const { context, page } = await openAuthenticatedPage(browser, baseURL);
  try {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app/);

    const telemetryResponse = page.waitForResponse((response) => {
      if (!response.url().endsWith('/api/telemetry') || response.request().method() !== 'POST') {
        return false;
      }

      try {
        const body = response.request().postDataJSON();
        return body?.type === 'analytics' && body.payload?.name === 'search_query_submitted';
      } catch {
        return false;
      }
    });
    const searchInput = page.locator('[data-search-bar] input').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('portable');
    await searchInput.press('Enter');

    const response = await telemetryResponse;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toMatchObject({
      type: 'analytics',
      payload: { name: 'search_query_submitted' },
    });
  } finally {
    await context.close();
  }
});

test('an unreachable first-party sink does not break the authenticated product flow', async ({ browser, baseURL }) => {
  const { context, page } = await openAuthenticatedPage(browser, baseURL);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  let telemetryAttempts = 0;
  try {
    await page.route('**/api/telemetry', (route) => {
      telemetryAttempts += 1;
      return route.abort('failed');
    });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    const searchInput = page.locator('[data-search-bar] input').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('portable');
    await searchInput.press('Enter');
    await expect.poll(() => telemetryAttempts).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/app/);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
