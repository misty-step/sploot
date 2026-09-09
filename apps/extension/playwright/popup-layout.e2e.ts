import path from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';
import { closeMv3Context, launchMv3Context, openMv3Popup, waitForMv3Worker, type Mv3Step } from './mv3-readiness';

test('unpaired popup fits narrow viewports and exposes accessible instance controls', async ({}, testInfo) => {
  const step: Mv3Step = (title, body) => test.step(title, body);
  let context: BrowserContext | undefined;
  try {
    const extensionPath = path.resolve('dist/chrome-mv3');
    context = await launchMv3Context(extensionPath);
    const worker = await waitForMv3Worker(context, testInfo, step);
    const popup = await openMv3Popup(context, new URL(worker.url()).host, testInfo, step);
    const instance = popup.getByLabel('Instance URL');
    await expect(instance).toBeVisible();
    for (const width of [360, 280, 240]) {
      await popup.setViewportSize({ width, height: 640 });
      await instance.fill('https://a-long-private-library-instance.example.test');
      expect(await popup.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const box = await instance.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expect(popup.getByRole('button', { name: 'Use instance' })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Connect device', exact: true })).toBeDisabled();
    }
    await testInfo.attach('narrow-popup', { body: await popup.screenshot(), contentType: 'image/png' });
  } finally {
    await closeMv3Context(context, testInfo);
  }
});
