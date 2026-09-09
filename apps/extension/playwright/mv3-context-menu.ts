import { execFileSync } from 'node:child_process';
import type { BrowserContext, Page } from '@playwright/test';
import { focusChromeWindow } from './mv3-controls';

/** Native Chrome UI, not a runtime-message capture substitute. Requires xdotool on Linux. */
export async function saveImageThroughContextMenu(context: BrowserContext, imageUrl: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(imageUrl);
  await page.bringToFront();
  const image = page.locator('img').first();
  await image.waitFor({ state: 'visible' });
  if (process.platform === 'linux') {
    await focusChromeWindow(page);
  }
  await image.click({ button: 'right' });
  // In a page containing an image Chrome puts extension actions immediately
  // above Inspect. Do not replace this native event with an auth/capture seam.
  if (process.platform === 'linux') execFileSync('xdotool', ['key', '--clearmodifiers', 'End', 'Up', 'Return'], { timeout: 5_000, stdio: 'pipe' });
  else {
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
  }
  return page;
}
