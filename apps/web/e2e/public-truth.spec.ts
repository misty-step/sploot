import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const evidenceDir = process.env.EVIDENCE_DIR;
const TOUCH_TARGET = 44;

function parseColor(color: string): number[] {
  if (color.startsWith('#')) {
    return color.replace('#', '').match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  }
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
  return channels.map((channel) => channel / 255);
}

function luminance(color: string): number {
  const channels = parseColor(color);
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Rendered-box proof for touch targets: resolves every element the locator
 * matches, requires at least `minCount` matches (an empty set can never pass
 * vacuously), and asserts each rendered box is >= 44x44 CSS pixels.
 */
async function expectTouchTargets(locator: Locator, label: string, minCount = 1): Promise<void> {
  const boxes = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { label: element.textContent?.trim().slice(0, 40) ?? '', width: rect.width, height: rect.height };
    }),
  );
  expect(boxes.length, `${label}: expected at least ${minCount} rendered link(s)`).toBeGreaterThanOrEqual(minCount);
  for (const box of boxes) {
    expect(box.width, `${label} "${box.label}" width`).toBeGreaterThanOrEqual(TOUCH_TARGET);
    expect(box.height, `${label} "${box.label}" height`).toBeGreaterThanOrEqual(TOUCH_TARGET);
  }
}

/** Effective rendered contrast of an element against its composited ancestor background. */
async function expectRenderedContrast(locator: Locator, label: string, minRatio = 4.5, minCount = 1): Promise<void> {
  const samples = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      let current: Element | null = element;
      let background = getComputedStyle(document.body).backgroundColor;
      while (current) {
        const candidate = getComputedStyle(current).backgroundColor;
        if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
          background = candidate;
          break;
        }
        current = current.parentElement;
      }
      return { label: element.textContent?.trim().slice(0, 40) ?? '', color: style.color, background };
    }),
  );
  expect(samples.length, `${label}: expected at least ${minCount} rendered element(s)`).toBeGreaterThanOrEqual(minCount);
  for (const sample of samples) {
    expect(
      contrastRatio(sample.color, sample.background),
      `${label} "${sample.label}" contrast ${sample.color} on ${sample.background}`,
    ).toBeGreaterThanOrEqual(minRatio);
  }
}

/** Wait for client hydration so assertions describe hydrated behavior, not just SSR HTML. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => typeof (window as { next?: unknown }).next !== 'undefined');
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of viewports) {
    test(`${theme} ${viewport.name}: public truth and interaction proof`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await waitForHydration(page);

      await expect(page.getByText('new enrollment is paused').first()).toBeVisible();
      expect(await page.getByText('new enrollment is paused').count(), 'exactly one paused statement on the landing page').toBe(1);
      await expect(page.getByRole('link', { name: 'claim your library' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'sign in' }).first()).toHaveAttribute('href', '/sign-in');
      await expect(page.getByRole('link', { name: 'contact support' }).first()).toHaveAttribute('href', '/support');

      // Landing auth links are real touch targets: the fixed sign-in pill and
      // both enrollment-notice escape actions.
      await expectTouchTargets(page.locator('nav').filter({ has: page.getByRole('link', { name: 'sign in' }) }).getByRole('link', { name: 'sign in' }), 'landing sign-in pill');
      await expectTouchTargets(page.getByLabel('new enrollment status').getByRole('link'), 'enrollment notice actions', 2);

      // Footer links are enumerated, non-empty, and each >=44px.
      await expectTouchTargets(page.getByRole('navigation', { name: 'Footer' }).getByRole('link'), 'footer links', 4);
      await expectTouchTargets(page.locator('footer').getByRole('link'), 'all footer anchors', 6);

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(overflow.document, 'document should not overflow horizontally').toBeLessThanOrEqual(overflow.viewport);
      expect(overflow.body, 'body should not overflow horizontally').toBeLessThanOrEqual(overflow.viewport);

      const input = page.getByRole('searchbox');
      await input.focus();
      await expect(input).toBeFocused();
      await input.fill('galaxy brain');
      const announcement = page.getByTestId('search-announcement');
      await expect(announcement).toHaveText('');
      const typedRun = await announcement.getAttribute('data-search-run');
      await page.keyboard.press('Enter');
      await expect(announcement).toContainText('search complete');
      const enterRun = await announcement.getAttribute('data-search-run');
      expect(enterRun).not.toBe(typedRun);
      await page.getByRole('button', { name: 'run search' }).click();
      await expect(announcement).toContainText('search complete');
      expect(await announcement.getAttribute('data-search-run')).not.toBe(enterRun);

      const tileOrder = () => page.getByRole('listitem').allTextContents();
      const initialOrder = await tileOrder();
      await page.getByRole('button', { name: 'shuffle the demo', exact: true }).click();
      await expect(announcement).toHaveText('demo pile shuffled');
      expect(await tileOrder()).not.toEqual(initialOrder);
      const towerOrder = await tileOrder();
      await page.getByRole('button', { name: 'shuffle the demo pile' }).click();
      await expect(announcement).toHaveText('demo pile shuffled');
      expect(await tileOrder()).not.toEqual(towerOrder);

      const tokens = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          link: styles.getPropertyValue('--sploot-public-link').trim(),
          shelf: styles.getPropertyValue('--sploot-paper').trim(),
          footerLink: styles.getPropertyValue('--sploot-public-footer-link').trim(),
          footer: styles.getPropertyValue('--sploot-void').trim(),
        };
      });
      expect(contrastRatio(tokens.link, tokens.shelf)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.footerLink, tokens.footer)).toBeGreaterThanOrEqual(4.5);
      // The demo count is measured as rendered in the active theme, never
      // from tokens alone.
      await expectRenderedContrast(page.getByTestId('demo-count'), 'demo count');
      expect(await page.getByRole('link', { name: 'support' }).last().evaluate((element) => getComputedStyle(element).textDecorationLine)).toContain('underline');

      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await expect(page.locator('.sploot-press').first()).toHaveCSS('animation-duration', '0s');

      if (evidenceDir) {
        await page.screenshot({
          path: `${evidenceDir}/${theme}-${viewport.name}.png`,
          fullPage: true,
        });
      }

      for (const route of ['/help', '/help/ios-shortcut', '/support', '/sign-up']) {
        await page.goto(route, { waitUntil: 'networkidle' });
        await waitForHydration(page);
        await expect(page.getByText(/new enrollment is paused/i).first()).toBeVisible();
        expect(await page.getByText(/new enrollment is paused/i).count(), `exactly one paused statement on ${route}`).toBe(1);
        await expect(page.getByRole('navigation', { name: 'Public pages' })).toBeVisible();

        // Header targets: the four nav links AND the brand link, at every
        // viewport including the 390px phone.
        await expectTouchTargets(page.getByRole('navigation', { name: 'Public pages' }).getByRole('link'), `${route} header nav links`, 4);
        await expectTouchTargets(page.locator('header').getByRole('link', { name: 'sploot', exact: true }), `${route} header brand link`);

        const privacyLink = page.getByRole('link', { name: 'privacy', exact: true });
        await privacyLink.focus();
        await expect(privacyLink).toBeFocused();
        await expect(privacyLink).toHaveCSS('text-decoration-line', /underline/);
        expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('create an account');
        if (route === '/sign-up') {
          await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
          await expectTouchTargets(page.getByLabel('account recovery actions').getByRole('link'), 'sign-up recovery actions', 2);
        }
        if (route === '/help/ios-shortcut') {
          // Settings deep links: meaningful >=44px targets with rendered
          // contrast in the active theme (replaces the former >=0 vacuity).
          const settingsLinks = page.getByRole('link', { name: /Settings/ });
          await expectTouchTargets(settingsLinks, 'iOS Settings links', 2);
          await expectRenderedContrast(settingsLinks, 'iOS Settings links', 4.5, 2);
          await expectRenderedContrast(page.getByRole('link', { name: /Back to Getting Started/ }), 'iOS back link');
        }
      }

      // Hydrated sign-in proof: after client hydration the paused truth is
      // visible and no sign-up affordance exists anywhere on the page.
      await page.goto('/sign-in', { waitUntil: 'networkidle' });
      await waitForHydration(page);
      await expect(page.getByText('new enrollment is paused').first()).toBeVisible();
      expect(await page.getByText('new enrollment is paused').count(), 'exactly one paused statement on /sign-in').toBe(1);
      await expect(page.locator('a[href*="sign-up"]')).toHaveCount(0);
      const signInText = (await page.locator('body').innerText()).toLowerCase();
      expect(signInText).not.toContain('create an account');
      expect(signInText).not.toContain('sign up');
      await expectTouchTargets(page.getByLabel('new enrollment status').getByRole('link'), 'sign-in notice actions', 2);

      for (const route of ['/privacy', '/changelog']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        // Descriptive policy prose may mention accounts; what must not exist
        // is any actionable sign-up path.
        await expect(page.locator('a[href*="sign-up"]')).toHaveCount(0);
      }

      const settingsResponse = await page.request.get('/app/settings', { maxRedirects: 0 });
      expect([307, 308, 401]).toContain(settingsResponse.status());
      if (settingsResponse.status() === 307 || settingsResponse.status() === 308) {
        expect(settingsResponse.headers().location).toContain('/sign-in');
      }

      const enrollmentResponse = await page.request.get('/api/health/enrollment');
      expect(enrollmentResponse.status()).toBe(200);
      expect(enrollmentResponse.headers()['cache-control']).toBe('no-store, private');
      expect(await enrollmentResponse.json()).toEqual({
        status: 'paused',
        mode: 'closed',
        configuration: 'valid',
      });

      await testInfo.attach('viewport', {
        body: JSON.stringify({ theme, ...viewport, tokens }, null, 2),
        contentType: 'application/json',
      });
    });
  }
}

test('public truth artifact preserves the protected redirect boundary', async ({ page }) => {
  const response = await page.request.get('/app', { maxRedirects: 0 });
  expect([307, 308, 401]).toContain(response.status());
  if (response.status() === 307 || response.status() === 308) {
    expect(response.headers().location).toContain('/sign-in');
  }
});
