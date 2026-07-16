import path from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
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

async function stopAndRestartServiceWorker(
  context: BrowserContext,
  popup: Page,
  previousWorker: Worker,
  testInfo: import('@playwright/test').TestInfo,
  step: Mv3Step,
): Promise<Worker> {
  return runMv3Step(context, testInfo, step, 'service worker termination and bounded restart', async () => {
    const cdp = await context.newCDPSession(popup);
    const browser = context.browser();
    if (!browser) throw new Error('persistent MV3 context has no browser target authority');
    const targetCdp = await browser.newBrowserCDPSession();
    const targetUrl = previousWorker.url();
    let lastTargets: Array<{ targetId: string; type: string; url: string }> = [];
    const readTargets = async () => {
      const current = await targetCdp.send('Target.getTargets');
      lastTargets = current.targetInfos.map(info => ({
        targetId: info.targetId,
        type: info.type,
        url: info.url,
      }));
      return current;
    };
    let latestVersion: {
      versionId: string;
      scriptURL: string;
      runningStatus: string;
      targetId?: string;
    } | undefined;
    const onVersionUpdated = ({ versions }: {
      versions: Array<{
        versionId: string;
        scriptURL: string;
        runningStatus: string;
        targetId?: string;
      }>;
    }) => {
      const extensionVersion = versions.find(version => version.scriptURL === targetUrl);
      if (extensionVersion) latestVersion = extensionVersion;
    };
    try {
      await targetCdp.send('Target.setDiscoverTargets', { discover: true });
      cdp.on('ServiceWorker.workerVersionUpdated', onVersionUpdated);
      await cdp.send('ServiceWorker.enable');
      const targets = await readTargets();
      const target = targets.targetInfos.find(info => info.type === 'service_worker' && info.url.startsWith('chrome-extension://'));
      expect(target).toBeTruthy();
      const terminatedTargetId = target!.targetId;

      await expect.poll(() => latestVersion?.targetId ?? null, { timeout: 5_000 }).toBe(terminatedTargetId);
      const version = latestVersion;
      expect(version).toBeTruthy();
      await cdp.send('ServiceWorker.stopWorker', { versionId: version!.versionId });
      await expect.poll(() => latestVersion?.runningStatus ?? null, { timeout: 15_000 }).toBe('stopped');
      await expect.poll(async () => {
        const current = await readTargets();
        return current.targetInfos.some(info => info.targetId === terminatedTargetId);
      }, { timeout: 15_000 }).toBe(false);

      // The queue message is the real wake trigger. Chromium may reuse a target
      // ID after the stopped target has disappeared, so the restart proof is
      // the observed absence above followed by a running service-worker target
      // here and a successful real queue message. Playwright may recycle its
      // Worker wrapper when Chromium recycles the target ID, so wrapper object
      // identity is not a lifecycle boundary.
      const wake = sendMv3Message<{ ok: boolean }>(
        popup,
        { type: 'sploot:update-status:get-status' },
        context,
        testInfo,
        step,
        'wake restarted worker through real update-status message',
      );
      await wake;
      try {
        await expect.poll(async () => {
          const current = await readTargets();
          return current.targetInfos.find(info => (
            info.type === 'service_worker'
            && info.url.startsWith('chrome-extension://')
          ))?.targetId ?? null;
        }, { timeout: 15_000 }).toBeTruthy();
      } catch (error) {
        throw new Error(`restarted worker target was not observed; targets=${JSON.stringify(lastTargets)}`, { cause: error });
      }
      await expect.poll(() => latestVersion?.runningStatus ?? null, { timeout: 15_000 }).toBe('running');
      const worker = context.serviceWorkers().find(candidate => candidate.url().startsWith('chrome-extension://'))
        ?? previousWorker;
      await wakeMv3Worker(worker, context, testInfo, step);
      return worker;
    } finally {
      cdp.off('ServiceWorker.workerVersionUpdated', onVersionUpdated);
      const detach = Promise.allSettled([cdp.detach(), targetCdp.detach()]).then(() => undefined);
      await Promise.race([
        detach,
        new Promise<void>(resolve => setTimeout(resolve, 5_000)),
      ]);
      void detach.catch(() => undefined);
    }
  });
}

test('dev MV3 seam shows update notice, opens update path, and clears after install', async ({}, testInfo) => {
  test.setTimeout(120_000);
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
        '--no-first-run',
        '--no-default-browser-check',
      ],
    }));
    let worker = await waitForMv3Worker(context, testInfo, step);
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

    await popup.getByRole('button', { name: /^Dismiss/ }).click();
    await popup.close();
    popup = await openMv3Popup(context, extensionId, testInfo, step);
    worker = await stopAndRestartServiceWorker(context, popup, worker, testInfo, step);
    const redelivered = await sendMv3Message<{ ok: boolean }>(
      popup,
      { type: SET_AVAILABLE, version: '1.1.0' },
      context,
      testInfo,
      step,
      're-deliver dismissed version after worker restart',
    );
    expect(redelivered).toEqual({ ok: true });
    const dismissedAfterRestart = await sendMv3Message<{ version: string; dismissed: boolean } | null>(
      popup,
      { type: 'sploot:update-status:get-status' },
      context,
      testInfo,
      step,
      'read persisted dismissal after worker restart',
    );
    expect(dismissedAfterRestart).toEqual({ version: '1.1.0', dismissed: true });
    await popup.close();
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

    await popup.getByRole('button', { name: /^Update/ }).click();
    await expect.poll(() => context.pages().map(page => page.url())).toContain('chrome://extensions/');
    await popup.close();
    popup = await openMv3Popup(context, extensionId, testInfo, step);

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
