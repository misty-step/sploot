import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import {
  closeMv3Context,
  openMv3Popup,
  runMv3Step,
  sendMv3Message,
  type Mv3Step,
  waitForMv3Worker,
  wakeMv3Worker,
} from './mv3-readiness';

const SET_AVAILABLE = 'sploot:update-status:test-set-available';
const SET_INSTALLED = 'sploot:update-status:test-set-installed';

test('dev MV3 seam shows update notice, opens update path, and clears after install', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const extensionPath = path.resolve('dist/chrome-mv3');
  let context: BrowserContext | undefined;
  const step: Mv3Step = (title, body) => test.step(title, body);
  try {
    context = await runMv3Step(undefined, testInfo, step, 'launch unpacked MV3 extension', () => chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath,
      ],
    }));
    const worker = await waitForMv3Worker(context, testInfo, step);
    await wakeMv3Worker(worker, context, testInfo, step);
    const extensionId = new URL(worker.url()).host;
    const popup = await openMv3Popup(context, extensionId, testInfo, step);

    const injected = await sendMv3Message<{ ok: boolean }>(
      popup,
      { type: SET_AVAILABLE, version: '1.1.0' },
      context,
      testInfo,
      step,
      'inject newer version through development seam',
    );
    expect(injected).toEqual({ ok: true });
    await popup.reload();
    await expect(popup.getByRole('status', { name: /update available/i })).toBeVisible();
    await expect(popup.getByText('Sploot 1.1.0 is ready.')).toBeVisible();

    const extensionsPagePromise = context.waitForEvent('page', { timeout: 15_000 });
    await popup.getByRole('button', { name: 'Update', exact: true }).click();
    const extensionsPage = await extensionsPagePromise;
    await expect.poll(() => extensionsPage.url()).toBe('chrome://extensions/');

    const installed = await sendMv3Message<{ ok: boolean }>(
      popup,
      { type: SET_INSTALLED, version: '1.1.0' },
      context,
      testInfo,
      step,
      'simulate installed current version through development seam',
    );
    expect(installed).toEqual({ ok: true });
    await popup.reload();
    await expect(popup.getByText('Update available')).toHaveCount(0);
  } finally {
    await closeMv3Context(context, testInfo);
  }
});
