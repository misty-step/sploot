import { expect, test } from '@playwright/test';

test.skip(process.env.SPLOOT_REAL_CLERK_E2E !== 'true', 'requires configured real Clerk provider credentials');

test('real Clerk provider seam remains available outside the signed-out public fixture', async ({ page }) => {
  expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toMatch(/^pk_(test|live)_/);
  expect(process.env.CLERK_SECRET_KEY).not.toBe('sk_test_public-truth-ci-only');
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/sign in/i).first()).toBeVisible();
});

test('hydrated real Clerk SignIn offers no sign-up path while enrollment is not open', async ({ page }) => {
  test.skip(process.env.SPLOOT_ENROLLMENT_MODE === 'ga', 'enrollment open: the sign-up link is expected');
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  // Wait for clerk-js itself to hydrate the widget, then prove the absence
  // of any sign-up affordance in the fully rendered component.
  await page.waitForFunction(() => Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
  await expect(page.locator('.cl-signIn-root, .cl-rootBox').first()).toBeVisible();
  await expect(page.locator('a[href*="sign-up"]')).toHaveCount(0);
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('sign up');
});
