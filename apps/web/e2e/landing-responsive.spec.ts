import { expect, test } from '@playwright/test';

test('landing navigation never covers the stat cards on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'search the pile. live.' })).toBeVisible();

  const navigation = page.getByRole('navigation', { name: 'landing navigation' });
  const stats = page.getByTestId('landing-stats');
  await expect(navigation).toBeVisible();
  await expect(stats).toBeVisible();

  // Exercise the failure mode from the audit: position the cards under the
  // top chrome as a fixed navigation would, then assert no control intersects.
  await page.evaluate(() => {
    const statsElement = document.querySelector<HTMLElement>('[data-testid="landing-stats"]');
    if (!statsElement) throw new Error('landing stats missing');
    window.scrollTo(0, Math.max(0, statsElement.getBoundingClientRect().top + window.scrollY - 8));
  });

  const bounds = await page.evaluate(() => {
    const navigationElement = document.querySelector<HTMLElement>('nav[aria-label="landing navigation"]');
    const statElements = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="landing-stats"] > *'));
    if (!navigationElement) throw new Error('landing navigation missing');
    const nav = navigationElement.getBoundingClientRect();
    const controls = Array.from(navigationElement.querySelectorAll<HTMLElement>('button, a')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: element.getAttribute('aria-label') ?? element.textContent?.trim(), top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    const cards = statElements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    });
    return { nav: { top: nav.top, bottom: nav.bottom }, controls, cards };
  });

  for (const control of bounds.controls) {
    for (const card of bounds.cards) {
      const overlaps = control.left < card.right && control.right > card.left && control.top < card.bottom && control.bottom > card.top;
      expect(overlaps, `${control.name} overlaps landing stat card`).toBe(false);
    }
  }
  expect(bounds.nav.bottom).toBeLessThanOrEqual(0);
});
