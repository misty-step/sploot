import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const evidenceDir = process.env.EVIDENCE_DIR;

function luminance(hex: string): number {
  const channels = hex.replace('#', '').match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const linear = channels.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of viewports) {
    test(`${theme} ${viewport.name}: public truth and interaction proof`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/', { waitUntil: 'networkidle' });

      await expect(page.getByText('new enrollment is paused').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'claim your library' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'sign in' }).first()).toHaveAttribute('href', '/sign-in');
      await expect(page.getByRole('link', { name: 'contact support' }).first()).toHaveAttribute('href', '/support');

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
        await expect(page.getByText(/new enrollment is paused/i).first()).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Public pages' })).toBeVisible();
        const privacyLink = page.getByRole('link', { name: 'privacy', exact: true });
        await privacyLink.focus();
        await expect(privacyLink).toBeFocused();
        await expect(privacyLink).toHaveCSS('text-decoration-line', /underline/);
        expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('create an account');
        if (route === '/sign-up') {
          await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
        }
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
