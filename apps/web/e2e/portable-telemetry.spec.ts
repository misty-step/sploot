import { expect, test, type Page } from '@playwright/test';

const PUBLIC_PAGES = ['/', '/privacy', '/help', '/support', '/changelog'];
const RETIRED_REQUEST_PREFIX = '/' + '_vercel';

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

test('production public pages stay provider-portable and console-clean', async ({ page }) => {
  for (const path of PUBLIC_PAGES) await assertPortablePage(page, path);
});

test('an unreachable first-party sink does not surface a browser error', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.route('**/api/telemetry', (route) => route.abort('failed'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Sploot/i);
  expect(consoleErrors).toEqual([]);
});
