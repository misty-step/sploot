import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createQaLocalAuthToken } from '../lib/auth/qa-local';
import { assertNoBrowserRequestFailures } from '../lib/qa/request-failure-policy';
import { verifyQaProvenanceManifest, type QaProvenanceManifest } from '../scripts/qa-provenance';

const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const axeSource = readFileSync(
  join(process.cwd(), '../../node_modules/.pnpm/axe-core@4.11.4/node_modules/axe-core/axe.min.js'),
  'utf8'
);

const viewports = [
  { width: 390, height: 844, label: '390x844' },
  { width: 1440, height: 900, label: '1440x900' },
] as const;
const themes = ['light', 'dark'] as const;

async function assertViewport(page: import('@playwright/test').Page) {
  const state = await page.evaluate(() => ({
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(state.hscroll, `horizontal overflow: ${JSON.stringify(state)}`).toBeLessThanOrEqual(1);
  expect(state.bodyWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
}

async function restoreGalleryScroll(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const style = getComputedStyle(node);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        node.scrollTop = 0;
      }
    }
  });
}

async function assertCleanSurface(page: import('@playwright/test').Page) {
  const surface = await page.evaluate(() => ({
    bodyText: document.body.innerText,
    fonts: { status: document.fonts.status, ready: document.fonts.check('16px sans-serif') },
    forbiddenNodes: Array.from(document.querySelectorAll(
      'nextjs-portal, [data-clerk-component], [data-clerk-overlay], iframe[src*="clerk"], [data-nextjs-dialog-overlay]'
    )).map((node) => node.outerHTML.slice(0, 240)),
  }));
  expect(surface.bodyText).not.toMatch(/configure your application|clerk|next\.js development|turbopack/i);
  expect(surface.forbiddenNodes, JSON.stringify(surface.forbiddenNodes)).toEqual([]);
  expect(surface.fonts.status).toBe('loaded');
  expect(surface.fonts.ready).toBe(true);
}

async function assertDecodedCards(page: import('@playwright/test').Page, label: string) {
  await expect.poll(async () => page.evaluate(() =>
    document.querySelectorAll('[role="list"][aria-label="meme results"] [role="listitem"]').length
  ), { timeout: 30_000, message: `${label} did not produce seeded cards` }).toBeGreaterThan(0);
  const images = page.locator('[role="list"][aria-label="meme results"] [role="listitem"] img').first(8);
  const imageCount = Math.min(await images.count(), 8);
  for (let index = 0; index < imageCount; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(async () => image.evaluate((node) => {
      const candidate = node as HTMLImageElement;
      return candidate.complete && candidate.naturalWidth > 0;
    }), { timeout: 30_000, message: `${label} image ${index + 1} did not decode` }).toBe(true);
  }
  await expect.poll(async () => page.evaluate(() =>
    Array.from(document.images).filter((image) => image.complete && image.naturalWidth > 0).length
  ), { timeout: 30_000, message: `${label} did not produce decoded seeded images` }).toBeGreaterThan(0);
  const counts = await page.evaluate(() => ({
    cards: document.querySelectorAll('[role="list"][aria-label="meme results"] [role="listitem"]').length,
    decodedImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth > 0).length,
    decodedImageBounds: Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth > 0)
      .map((image) => ({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })),
  }));
  expect(counts.cards, `${label} card count`).toBeGreaterThan(0);
  expect(counts.decodedImages, `${label} decoded image count`).toBeGreaterThan(0);
  expect(counts.decodedImageBounds.every((bounds) => bounds.naturalWidth > 0 && bounds.naturalHeight > 0 && bounds.width > 0 && bounds.height > 0), `${label} decoded image bounds`).toBe(true);
  return counts;
}

async function assertA11y(page: import('@playwright/test').Page) {
  // Let the deterministic tile reveal settle before axe samples computed
  // colors; otherwise a mid-animation opacity is reported as a false contrast
  // failure rather than the rendered resting state.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { animation.finish(); } catch { /* an already-finished animation */ }
    }
  });
  await page.evaluate((source) => {
    // Evaluate in the page realm so Next's React tree never sees a script tag.
    (0, eval)(source);
  }, axeSource);
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return (window as any).axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa'],
    });
  });
  expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

function assertBuildProvenance(): { manifest: QaProvenanceManifest; manifestDigest: string } {
  const manifestPath = join(process.cwd(), '.next/qa-provenance.json');
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString('utf8')) as QaProvenanceManifest;
  verifyQaProvenanceManifest(join(process.cwd(), '../..'), manifest);
  return { manifest, manifestDigest: createHash('sha256').update(bytes).digest('hex') };
}

test.describe('authenticated seeded gallery', () => {
  test.setTimeout(300_000);

  test('login refreshes the signed cookie before middleware checks /app', async ({ browser, baseURL }) => {
    const staleHeaderToken = await createQaLocalAuthToken({
      userId: 'qa-design-user',
      email: 'qa-design-user@qa.local',
      secret: qaSecret,
      expiresInSeconds: 15 * 60,
    });
    const context = await browser.newContext({ baseURL });
    await context.setExtraHTTPHeaders({ 'x-sploot-qa-auth': staleHeaderToken });
    await context.addCookies([
      { name: 'sploot_qa_auth', value: staleHeaderToken, url: baseURL },
    ]);

    const page = await context.newPage();
    const response = await page.goto('/api/qa-auth/login', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/app/);
    const refreshedCookie = await context.cookies(baseURL);
    expect(refreshedCookie.find(({ name }) => name === 'sploot_qa_auth')?.value).not.toBe(staleHeaderToken);
    await context.close();
  });

  test('covers the locked state matrix, keyboard semantics, pagination, and cache', async ({ browser, baseURL }, testInfo) => {
    expect(process.env.PLAYWRIGHT_SERVER_MODE ?? 'production').toBe('production');
    expect(baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?$/);
    const token = await createQaLocalAuthToken({
      userId: 'qa-design-user',
      email: 'qa-design-user@qa.local',
      secret: qaSecret,
      expiresInSeconds: 15 * 60,
    });
    const runSeed = Number(process.env.SPLOOT_QA_GALLERY_SEED ?? '296');
    expect(Number.isSafeInteger(runSeed)).toBe(true);
    const provenance: Array<Record<string, unknown>> = [];
    const buildProvenance = assertBuildProvenance();

    for (const theme of themes) {
      for (const viewport of viewports) {
        console.log(`[gallery] start ${theme} ${viewport.label}`);
        const context = await browser.newContext({ baseURL, viewport: { width: viewport.width, height: viewport.height } });
        await context.setExtraHTTPHeaders({
          'x-sploot-qa-auth': token,
        });
        await context.addCookies([
          { name: 'sploot_qa_auth', value: token, url: baseURL },
          { name: 'sploot-theme', value: theme, url: baseURL },
        ]);
        await context.addInitScript((selectedTheme) => {
          window.localStorage.setItem('theme', selectedTheme);
        }, theme);

        const page = await context.newPage();
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const requestFailures: string[] = [];
        const forbiddenRequests: string[] = [];
        const httpFailures: string[] = [];
        const expectedInjected503Urls = new Set<string>();
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(`${message.text()} @ ${message.location().url}`);
        });
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`));
        page.on('request', (request) => {
          if (/webpack-hmr|__nextjs_original-stack-frame|_next\/static\/development|turbopack/i.test(request.url())) {
            forbiddenRequests.push(`${request.method()} ${request.url()}`);
          }
        });
        page.on('response', (response) => {
          if (response.status() >= 400) httpFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        });

        // Keep the visual/a11y pass representative without rendering all 100
        // seeded records at once; the direct API loop below proves the full
        // deterministic result set and honest total.
        await page.route('**/api/assets**', async (route) => {
          const response = await route.fetch();
          const body = await response.json() as { assets?: unknown[] };
          await route.fulfill({
            response,
            body: JSON.stringify({ ...body, assets: body.assets?.slice(0, 24) ?? [] }),
          });
        });
        await page.goto('/api/qa-auth/login', { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await expect(page).toHaveURL(/\/app/);
        await expect(page.getByRole('list', { name: 'meme results' })).toBeVisible({ timeout: 30_000 });
        await assertCleanSurface(page);
        const browseCounts = await assertDecodedCards(page, `${theme} ${viewport.label} browse`);
        await restoreGalleryScroll(page);
        await assertViewport(page);
        await assertA11y(page);
        console.log(`[gallery] browse checked ${theme} ${viewport.label}`);
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-browse.png`) });
        const browseCards = await page.getByRole('list', { name: 'meme results' }).getByRole('listitem').count();

        const firstOpen = page.getByRole('button', { name: /^open / }).first();
        await firstOpen.focus();
        await firstOpen.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('cosine')).toBeVisible();
        await expect(dialog.getByText(/match/i)).toBeVisible();
        await expect(dialog.getByRole('definition').first()).toBeVisible();
        const dialogButtons = dialog.getByRole('button');
        const firstDialogButton = dialogButtons.first();
        const lastDialogButton = dialogButtons.last();
        await firstDialogButton.focus();
        await page.keyboard.press('Shift+Tab');
        await expect(lastDialogButton).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(firstDialogButton).toBeFocused();
        const touchTargets = await dialogButtons.evaluateAll((buttons) => buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }));
        expect(touchTargets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
        await assertA11y(page);
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-detail.png`) });
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(firstOpen).toBeFocused();
        console.log(`[gallery] detail checked ${theme} ${viewport.label}`);

        const uploadButton = viewport.width < 768
          ? page.getByRole('button', { name: 'upload meme' })
          : page.getByRole('button', { name: 'upload', exact: true }).first();
        await uploadButton.click();
        await expect(page.getByText('drag chaos here')).toBeVisible();
        await assertCleanSurface(page);
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-upload.png`) });
        await uploadButton.click();
        console.log(`[gallery] upload checked ${theme} ${viewport.label}`);

        if (viewport.width < 768) {
          await page.getByRole('button', { name: 'search memes' }).click();
        }
        const searchInput = viewport.width < 768
          ? page.locator('input[placeholder="type words. get the picture."]:visible').first()
          : page.locator('input[placeholder="type words. get the picture."]:visible').first();
        await expect(searchInput).toBeVisible({ timeout: 10_000 });
        const searchRequests: string[] = [];
        const assetRequestsAfterSearch: string[] = [];
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().includes('/api/search')) searchRequests.push(request.url());
          if (request.url().includes('/api/assets')) assetRequestsAfterSearch.push(request.url());
        });

        await searchInput.fill('reaction face meme');
        const searchingStatus = viewport.width < 768
          ? page.getByText('searching…').last()
          : page.getByRole('region', { name: 'retrieval pipeline' }).getByText('working').first();
        await expect(searchingStatus).toBeVisible({ timeout: 10_000 });
        await restoreGalleryScroll(page);
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-searching.png`) });
        await expect.poll(() => searchRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
        const resultStatus = viewport.width < 768
          ? page.getByText(/\d+ matches/).last()
          : page.getByRole('region', { name: 'retrieval pipeline' }).getByText(/\d+ matches/).first();
        await expect(resultStatus).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('list', { name: 'search query tokens' })).toBeVisible();
        const settledSearchCounts = await assertDecodedCards(page, `${theme} ${viewport.label} settled search`);
        await restoreGalleryScroll(page);
        const settledSearchCards = await page.getByRole('list', { name: 'meme results' }).getByRole('listitem').count();
        expect(assetRequestsAfterSearch.filter((url) => url.includes('/api/assets'))).toEqual([]);
        await assertCleanSurface(page);
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-results.png`) });
        await searchInput.press('Escape');
        await expect(searchInput).toHaveValue('');
        console.log(`[gallery] search checked ${theme} ${viewport.label}`);
        expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
        expect(pageErrors, pageErrors.join('\n')).toEqual([]);
        expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([]);
        assertNoBrowserRequestFailures(requestFailures);

        provenance.push({
          theme,
          viewport: { ...viewport },
          baseURL,
          route: '/app',
          qaUser: 'qa-design-user',
          seed: runSeed,
          browseCards,
          browseCounts,
          settledSearchCards,
          settledSearchCounts,
          consoleErrors,
          pageErrors,
          requestFailures,
          forbiddenRequests,
          httpFailuresBeforeInjectedStates: [...httpFailures],
        });

        await page.route('**/api/search', async (route) => {
          const requestBody = route.request().postDataJSON() as { query?: string };
          if (requestBody.query === 'no-match') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ results: [], total: 0, hasMore: false, processingTime: 4, cached: false }),
            });
            return;
          }
          if (requestBody.query === 'broken-query') {
            expectedInjected503Urls.add(route.request().url());
            await route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Search is temporarily unavailable' }),
            });
            return;
          }
          await route.continue();
        });

        await searchInput.fill('no-match');
        await expect(page.getByText('no matches in the pile')).toBeVisible({ timeout: 30_000 });
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-zero.png`) });

        await searchInput.fill('broken-query');
        await expect(page.getByText('retrieval failed')).toBeVisible({ timeout: 30_000 });
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-error.png`) });

        const emptyPage = await context.newPage();
        await emptyPage.route('**/api/assets**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ assets: [], total: 0, hasMore: false }),
        }));
        await emptyPage.goto('/app', { waitUntil: 'networkidle', timeout: 90_000 });
        await expect(emptyPage.getByText(/the\.pile — 0 memes/)).toBeVisible({ timeout: 30_000 });
        await assertCleanSurface(emptyPage);
        await assertViewport(emptyPage);
        await emptyPage.screenshot({ path: testInfo.outputPath(`${theme}-${viewport.label}-empty.png`) });
        await emptyPage.close();

        const expectedHttpFailures = [...expectedInjected503Urls].map((url) => `503 POST ${url}`);
        expect(httpFailures, httpFailures.join('\n')).toEqual(expectedHttpFailures);
        expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([]);
        const scopedExpected503ConsoleErrors = consoleErrors.filter((error) =>
          /failed to load resource: the server responded with a status of 503 \(service unavailable\)/i.test(error) &&
          [...expectedInjected503Urls].some((url) => error.includes(`@ ${url}`))
        );
        const unexpectedConsoleErrors = consoleErrors.filter((error) => !scopedExpected503ConsoleErrors.includes(error));
        expect(unexpectedConsoleErrors, unexpectedConsoleErrors.join('\n')).toEqual([]);
        expect(scopedExpected503ConsoleErrors).toHaveLength(expectedInjected503Urls.size);
        expect(pageErrors, pageErrors.join('\n')).toEqual([]);
        assertNoBrowserRequestFailures(requestFailures);
        Object.assign(provenance[provenance.length - 1], {
          httpFailures: [...httpFailures],
          scopedExpected503ConsoleErrors,
        });

        if (theme === 'light' && viewport.width === 390) {
          const reducedContext = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            reducedMotion: 'reduce',
          });
          await reducedContext.setExtraHTTPHeaders({
            'x-sploot-qa-auth': token,
          });
          await reducedContext.addCookies([
            { name: 'sploot_qa_auth', value: token, url: baseURL },
            { name: 'sploot-theme', value: theme, url: baseURL },
          ]);
          const reducedPage = await reducedContext.newPage();
          const reducedFailures: string[] = [];
          const reducedConsoleErrors: string[] = [];
          const reducedPageErrors: string[] = [];
          const reducedForbiddenRequests: string[] = [];
          const reducedHttpFailures: string[] = [];
          reducedPage.on('console', (message) => {
            if (message.type() === 'error') reducedConsoleErrors.push(`${message.text()} @ ${message.location().url}`);
          });
          reducedPage.on('pageerror', (error) => reducedPageErrors.push(String(error)));
          reducedPage.on('request', (request) => {
            if (/webpack-hmr|__nextjs_original-stack-frame|_next\/static\/development|turbopack/i.test(request.url())) {
              reducedForbiddenRequests.push(`${request.method()} ${request.url()}`);
            }
          });
          reducedPage.on('response', (response) => {
            if (response.status() >= 400) reducedHttpFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
          });
          reducedPage.on('requestfailed', (request) => reducedFailures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'unknown failure'}`));
          await reducedPage.route('**/api/assets**', async (route) => {
            const response = await route.fetch();
            const body = await response.json() as { assets?: unknown[] };
            await route.fulfill({ response, body: JSON.stringify({ ...body, assets: body.assets?.slice(0, 24) ?? [] }) });
          });
          await reducedPage.goto('/api/qa-auth/login', { waitUntil: 'domcontentloaded', timeout: 90_000 });
          await expect(reducedPage.getByRole('list', { name: 'meme results' })).toBeVisible({ timeout: 30_000 });
          await assertCleanSurface(reducedPage);
          const reducedCounts = await assertDecodedCards(reducedPage, 'light 390x844 reduced motion');
          await restoreGalleryScroll(reducedPage);
          await assertA11y(reducedPage);
          const motion = await reducedPage.evaluate(() => ({
            reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            rootScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
            bodyScrollBehavior: getComputedStyle(document.body).scrollBehavior,
          }));
          expect(motion.reduced).toBe(true);
          expect(motion.rootScrollBehavior).not.toBe('smooth');
          expect(motion.bodyScrollBehavior).not.toBe('smooth');
          expect(reducedConsoleErrors, reducedConsoleErrors.join('\n')).toEqual([]);
          expect(reducedPageErrors, reducedPageErrors.join('\n')).toEqual([]);
          expect(reducedForbiddenRequests, reducedForbiddenRequests.join('\n')).toEqual([]);
          expect(reducedHttpFailures, reducedHttpFailures.join('\n')).toEqual([]);
          assertNoBrowserRequestFailures(reducedFailures);
          await reducedPage.screenshot({ path: testInfo.outputPath('light-390x844-reduced-motion.png') });
          provenance.push({
            theme,
            viewport: { ...viewport },
            reducedMotion: true,
            cards: reducedCounts.cards,
            decodedImages: reducedCounts.decodedImages,
            decodedImageBounds: reducedCounts.decodedImageBounds,
            requestFailures: reducedFailures,
          });
          await reducedContext.close();
        }

        // The state matrix runs at every viewport/theme; the expensive
        // authenticated pagination/cache contract needs one representative
        // browser context because the API assertions are viewport-invariant.
        if (theme === 'light' && viewport.width === 1440) {
          const pageSize = 10;
          const allIds = new Set<string>();
          for (let offset = 0; offset < 100; offset += pageSize) {
            const response = await page.request.post('/api/search', {
              data: { query: 'reaction face meme', threshold: 0, limit: pageSize, offset, shuffleSeed: runSeed },
            });
            expect(response.ok()).toBeTruthy();
            const body = await response.json();
            expect(body.total).toBeGreaterThanOrEqual(100);
            expect(body.results).toHaveLength(pageSize);
            for (const result of body.results) {
              expect(allIds.has(result.id), `overlap at offset ${offset}: ${result.id}`).toBe(false);
              allIds.add(result.id);
            }
          }
          expect(allIds.size).toBe(100);

          const cacheSeed = runSeed + 1;
          const firstCacheResponse = await page.request.post('/api/search', {
            data: { query: 'reaction face meme', threshold: 0, limit: 7, shuffleSeed: cacheSeed },
          });
          const secondCacheResponse = await page.request.post('/api/search', {
            data: { query: 'reaction face meme', threshold: 0, limit: 7, shuffleSeed: cacheSeed },
          });
          expect((await firstCacheResponse.json()).cached).toBe(false);
          expect((await secondCacheResponse.json()).cached).toBe(true);
        }

        await context.close();
      }
    }

    const finalManifestBytes = readFileSync(join(process.cwd(), '.next/qa-provenance.json'));
    expect(createHash('sha256').update(finalManifestBytes).digest('hex'))
      .toBe(buildProvenance.manifestDigest);

    writeFileSync(testInfo.outputPath('matrix-provenance.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      seed: runSeed,
      authMode: 'qa-local',
      qaUser: 'qa-design-user',
      viewports,
      themes,
      captures: provenance,
      build: buildProvenance.manifest,
      buildManifestSha256: buildProvenance.manifestDigest,
      lifecycle: process.env.QA_EVIDENCE_LIFECYCLE_PATH
        ? JSON.parse(readFileSync(process.env.QA_EVIDENCE_LIFECYCLE_PATH, 'utf8'))
        : null,
      production: {
        serverMode: process.env.PLAYWRIGHT_SERVER_MODE ?? 'production',
        baseURL,
        noDevOverlayOrHmr: true,
      },
    }, null, 2));
  });
});
