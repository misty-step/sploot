import { expect, test, type Browser, type Page } from '@playwright/test';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';

const PUBLIC_PAGES = ['/', '/privacy', '/help', '/support', '/changelog'];
const RETIRED_REQUEST_PREFIX = '/' + '_vercel';
const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';

function isRetiredProviderRequest(url: string): boolean {
  return url.includes(RETIRED_REQUEST_PREFIX) || /(?:analytics|speed[-_]?insights)/i.test(url);
}

async function assertPortablePage(page: Page, path: string, baseURL: string | undefined) {
  const expectedOrigin = new URL(baseURL ?? 'http://127.0.0.1:3108').origin;
  const providerRequests: string[] = [];
  const externalRequests: string[] = [];
  const telemetryRequests: string[] = [];
  const failedRequests: string[] = [];
  const badResponses: string[] = [];
  const consoleErrors: string[] = [];
  const onRequest = (request: { url(): string }) => {
    const url = request.url();
    if (isRetiredProviderRequest(url)) providerRequests.push(url);
    try {
      const parsed = new URL(url);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.origin !== expectedOrigin) {
        externalRequests.push(url);
      }
      if (parsed.pathname === '/api/telemetry') telemetryRequests.push(url);
    } catch {
      // Browser-internal URLs are not network requests we can classify here.
    }
  };
  const onRequestFailed = (request: {
    url(): string;
    resourceType(): string;
    failure(): { errorText?: string } | null;
  }) => {
    const failure = request.failure();
    let parsed: URL | null = null;
    try {
      parsed = new URL(request.url());
    } catch {
      // Browser-internal URLs are not network requests we can classify here.
    }
    const isBenignRscPrefetchCancellation =
      failure?.errorText === 'net::ERR_ABORTED' &&
      request.resourceType() === 'fetch' &&
      parsed?.origin === expectedOrigin &&
      parsed?.searchParams.has('_rsc');
    if (!isBenignRscPrefetchCancellation) {
      failedRequests.push(request.url() + (failure?.errorText ? ' (' + failure.errorText + ')' : ''));
    }
  };
  const onResponse = (response: { url(): string; status(): number }) => {
    if (response.status() >= 400) badResponses.push(response.status() + ' ' + response.url());
  };
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };

  page.on('request', onRequest);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  page.on('console', onConsole);
  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Sploot/i);
    await page.waitForTimeout(1000);
    expect(providerRequests).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(telemetryRequests).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(badResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    page.off('request', onRequest);
    page.off('requestfailed', onRequestFailed);
    page.off('response', onResponse);
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

test('public truth pages stay provider-portable and console-clean', async ({ page, baseURL }) => {
  for (const path of PUBLIC_PAGES) await assertPortablePage(page, path, baseURL);
});

test('qa-local authenticated product flow emits an actual telemetry POST', async ({ browser, baseURL }) => {
  const { context, page } = await openAuthenticatedPage(browser, baseURL);
  try {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/app/);

    const telemetryRequest = page.waitForRequest((request) => {
      if (!request.url().endsWith('/api/telemetry') || request.method() !== 'POST') {
        return false;
      }

      try {
        const body = request.postDataJSON();
        return body?.type === 'analytics' && body.payload?.name === 'search_query_submitted';
      } catch {
        return false;
      }
    });
    const searchInput = page.locator('[data-search-bar] input').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('portable');
    await searchInput.press('Enter');

    const request = await telemetryRequest;
    expect(request.postDataJSON()).toMatchObject({
      type: 'analytics',
      payload: { name: 'search_query_submitted' },
    });
  } finally {
    await context.close();
  }
});

test('an unreachable first-party sink does not break the authenticated product flow', async ({ browser, baseURL }) => {
  const { context, page } = await openAuthenticatedPage(browser, baseURL);
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
  } finally {
    await context.close();
  }
});
