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
    let popup = await openMv3Popup(context, extensionId, testInfo, step);
    // Let the real native startup check settle before injecting deterministic QA state.
    await popup.waitForTimeout(3_500);

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
    await expect(popup.getByText('Update available', { exact: true })).toBeVisible();
    await expect(popup.getByText('Sploot 1.1.0 is ready.')).toBeVisible();

    await popup.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await popup.close();
    await worker.evaluate(() => self.close());
    await wakeMv3Worker(worker, context, testInfo, step);
    popup = await openMv3Popup(context, extensionId, testInfo, step);
    await expect(popup.getByText('Update available')).toHaveCount(0);

    const newer = await sendMv3Message<{ ok: boolean }>(
      popup,
      { type: SET_AVAILABLE, version: '1.2.0' },
      context,
      testInfo,
      step,
      'deliver newer version after per-version dismissal',
    );
    expect(newer).toEqual({ ok: true });
    await popup.reload();
    await expect(popup.getByText('Sploot 1.2.0 is ready.')).toBeVisible();

    await popup.getByRole('button', { name: 'Update', exact: true }).click();
    await expect.poll(() => context.pages().map(page => page.url())).toContain('chrome://extensions/');

    const installed = await sendMv3Message<{ ok: boolean }>(
      popup,
      { type: SET_INSTALLED, version: '1.2.0' },
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
