import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { runMv3Step, sendMv3Message, wakeMv3Worker, type Mv3Step } from './mv3-readiness';
const LIST_QUEUE = 'sploot:context-menu-save:list-queue';
const ACTION_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+Y' : 'Control+Shift+Y';

export async function focusChromeWindow(page: Page) {
  // A unique page title selects this context's window, not another test's
  // browser or a brand-specific WM_CLASS. Bound both native waits.
  const title = `Sploot MV3 ${randomUUID()}`;
  await page.evaluate(title => { document.title = title; }, title);
  await page.bringToFront();
  const windows = execFileSync('xdotool', [
    'search', '--sync', '--onlyvisible', '--name', `^${title}`,
  ], { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\s+/);
  if (windows.length !== 1 || !windows[0]) throw new Error('Expected one native window for the MV3 page.');
  execFileSync('xdotool', ['windowfocus', '--sync', windows[0]], { timeout: 5_000, stdio: 'pipe' });
}

export async function invokeBrowserActionShortcut(page: Page) {
  if (process.platform === 'linux') {
    // Playwright key events target the renderer and do not cross Chrome's UI
    // accelerator boundary. Xvfb intentionally has no window manager, so find
    // and focus the real fixture window directly before invoking the installed
    // extension's reserved _execute_action command. That earns the same
    // transient activeTab grant as an operator shortcut.
    await focusChromeWindow(page);
    execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+shift+y'], { timeout: 5_000, stdio: 'pipe' });
    return;
  }
  await page.keyboard.press(ACTION_SHORTCUT);
}

export async function stopAndRestart(
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
    await previousWorker.evaluate(() => {
      Object.defineProperty(globalThis, '__splootWorkerLifecycleProbe', { value: true, configurable: true });
    });
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
    let stoppingVersion: string | undefined;
    let observedStop = false;
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
      if (versions.some(version => version.versionId === stoppingVersion && version.runningStatus === 'stopped')) {
        observedStop = true;
      }
    };
    try {
      await targetCdp.send('Target.setDiscoverTargets', { discover: true });
      cdp.on('ServiceWorker.workerVersionUpdated', onVersionUpdated);
      await cdp.send('ServiceWorker.enable');
      const targets = await readTargets();
      const target = targets.targetInfos.find(info => info.type === 'service_worker' && info.url === targetUrl);
      expect(target).toBeTruthy();
      const terminatedTargetId = target!.targetId;

      await expect.poll(() => latestVersion?.targetId ?? null, { timeout: 5_000 }).toBe(terminatedTargetId);
      const version = latestVersion;
      expect(version).toBeTruthy();
      stoppingVersion = version!.versionId;
      await cdp.send('ServiceWorker.stopWorker', { versionId: version!.versionId });
      await expect.poll(() => observedStop, { timeout: 15_000 }).toBe(true);

      // An open action popup can wake the stopped worker immediately. Chromium
      // may retain/reuse its target ID; a polling gap is not a lifecycle event.
      // Prove termination through CDP, then prove a fresh JavaScript heap below.
      const wake = sendMv3Message<{ ok: boolean }>(
        popup,
        { type: LIST_QUEUE },
        context,
        testInfo,
        step,
        'wake restarted worker through real queue message',
      );
      expect(await wake).toMatchObject({ ok: true });
      try {
        await expect.poll(async () => {
          const current = await readTargets();
          return current.targetInfos.find(info => (
            info.type === 'service_worker'
            && info.url === targetUrl
          ))?.targetId ?? null;
        }, { timeout: 15_000 }).toBeTruthy();
      } catch (error) {
        throw new Error(`restarted worker target was not observed; targets=${JSON.stringify(lastTargets)}`, { cause: error });
      }
      await expect.poll(() => latestVersion?.runningStatus ?? null, { timeout: 15_000 }).toBe('running');
      const worker = context.serviceWorkers().find(candidate => candidate.url() === targetUrl)
        ?? previousWorker;
      await wakeMv3Worker(worker, context, testInfo, step);
      expect(await worker.evaluate(() => Object.hasOwn(globalThis, '__splootWorkerLifecycleProbe'))).toBe(false);
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
