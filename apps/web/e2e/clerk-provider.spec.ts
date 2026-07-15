import { expect, test } from '@playwright/test';

test.skip(process.env.SPLOOT_REAL_CLERK_E2E !== 'true', 'requires configured real Clerk provider credentials');

test('real Clerk provider seam remains available outside the signed-out public fixture', async ({ page }) => {
  expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toMatch(/^pk_(test|live)_/);
  expect(process.env.CLERK_SECRET_KEY).not.toBe('sk_test_public-truth-ci-only');
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/sign in/i).first()).toBeVisible();
});
