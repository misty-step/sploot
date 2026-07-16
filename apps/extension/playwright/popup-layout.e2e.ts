import path from 'node:path';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import {
  closeMv3Context,
  openMv3Popup,
  runMv3Step,
  sendMv3Message,
  waitForMv3Worker,
  wakeMv3Worker,
  type Mv3Step,
} from './mv3-readiness';

const AUTH_KEY = 'sploot:e2e-auth-authority';
const QUEUE_KEY = 'sploot:context-menu-queue';
const LIST_QUEUE = 'sploot:context-menu-save:list-queue';

test('real popup and worker isolate durable queue metadata by auth owner', async ({}, testInfo) => {
  test.setTimeout(60_000);
  const extensionPath = path.resolve('dist/chrome-mv3');
  let context: BrowserContext | undefined;
  const step: Mv3Step = (title, body) => test.step(title, body);
  try {
    context = await runMv3Step(undefined, testInfo, step, 'launch persistent unpacked MV3 Chrome', () => chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    }));
    const worker = await waitForMv3Worker(context, testInfo, step);
    await wakeMv3Worker(worker, context, testInfo, step);
    const extensionId = new URL(worker.url()).host;
    const popup = await openMv3Popup(context, extensionId, testInfo, step);

    for (const width of [280, 240]) {
      await popup.setViewportSize({ width, height: 640 });
      const popupWidth = await popup.evaluate(() => document.documentElement.scrollWidth);
      expect(popupWidth).toBeLessThanOrEqual(width);
    }

    await worker.evaluate(async ({ authKey, queueKey }) => {
      await chrome.storage.local.set({
        [authKey]: { userId: 'layout-user-a', accountId: 'layout-user-a', sessionId: 'layout-session-a' },
        [queueKey]: [{
          id: 'layout-job',
          imageUrl: 'https://private.test/layout.png',
          filename: 'owner-a.png',
          state: 'failed',
          createdAt: Date.now(),
          attempts: 1,
          nextAttemptAt: 0,
          owner: { userId: 'layout-user-a', accountId: 'layout-user-a', sessionId: 'layout-session-a' },
          sourceBytes: btoa('immutable'),
          sourceType: 'image/png',
          lastError: 'retryable',
        }],
      });
    }, { authKey: AUTH_KEY, queueKey: QUEUE_KEY });
    await popup.reload();
    await expect(popup.getByText('Signed in as')).toBeVisible();
    await expect(popup.getByText('layout-user-a')).toBeVisible();
    await expect(popup.getByText('owner-a.png')).toBeVisible();
    const ownerAList = await sendMv3Message(
      popup, { type: LIST_QUEUE }, context, testInfo, step, 'owner A queue-list message',
    );
    expect(ownerAList).toMatchObject({ ok: true, jobs: [{ filename: 'owner-a.png' }] });

    await worker.evaluate(async authKey => {
      await chrome.storage.local.set({
        [authKey]: { userId: 'layout-user-b', accountId: 'layout-user-b', sessionId: 'layout-session-b' },
      });
    }, AUTH_KEY);
    await popup.reload();
    await expect(popup.getByText('Signed in as')).toBeVisible();
    await expect(popup.getByText('layout-user-b')).toBeVisible();
    await expect(popup.getByText('owner-a.png')).toHaveCount(0);
    const ownerBList = await sendMv3Message(
      popup, { type: LIST_QUEUE }, context, testInfo, step, 'owner B queue-list message',
    );
    expect(ownerBList).toEqual({ ok: true, jobs: [] });
    expect(JSON.stringify(ownerBList)).not.toContain('private.test');
  } finally {
    await closeMv3Context(context, testInfo);
  }
});
