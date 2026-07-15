import { writeFile } from 'node:fs/promises';
import type { BrowserContext, Page, TestInfo, Worker } from '@playwright/test';

export type Mv3Step = <T>(title: string, body: () => Promise<T>) => Promise<T>;

const SERVICE_WORKER_TIMEOUT_MS = 15_000;
const POPUP_TIMEOUT_MS = 15_000;
const CLEANUP_TIMEOUT_MS = 5_000;
const MESSAGE_TIMEOUT_MS = 15_000;

export async function runMv3Step<T>(
  context: BrowserContext | undefined,
  testInfo: TestInfo,
  step: Mv3Step,
  title: string,
  body: () => Promise<T>,
): Promise<T> {
  return step(title, async () => {
    try {
      return await body();
    } catch (error) {
      await attachDiagnostics(context, testInfo, title, error);
      throw error;
    }
  });
}

export async function waitForMv3Worker(
  context: BrowserContext,
  testInfo: TestInfo,
  step: Mv3Step,
): Promise<Worker> {
  return runMv3Step(context, testInfo, step, 'service worker readiness', async () => {
    const existing = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'));
    if (existing) return existing;

    return await context.waitForEvent('serviceworker', {
      timeout: SERVICE_WORKER_TIMEOUT_MS,
      predicate: worker => worker.url().startsWith('chrome-extension://'),
    });
  });
}

export async function wakeMv3Worker(
  worker: Worker,
  context: BrowserContext,
  testInfo: TestInfo,
  step: Mv3Step,
): Promise<void> {
  await runMv3Step(context, testInfo, step, 'service worker wake and storage readiness', async () => {
    const manifest = await worker.evaluate(async () => {
      await chrome.storage.local.get(null);
      return chrome.runtime.getManifest();
    });
    if (manifest.manifest_version !== 3) {
      throw new Error(`loaded extension is not MV3: ${manifest.manifest_version}`);
    }
  });
}

export async function openMv3Popup(
  context: BrowserContext,
  extensionId: string,
  testInfo: TestInfo,
  step: Mv3Step,
) {
  return runMv3Step(context, testInfo, step, 'popup navigation and DOM readiness', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      timeout: POPUP_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });
    await popup.locator('#root').waitFor({ state: 'attached', timeout: POPUP_TIMEOUT_MS });
    return popup;
  });
}

export async function sendMv3Message<T>(
  popup: Page,
  message: Record<string, unknown>,
  context: BrowserContext,
  testInfo: TestInfo,
  step: Mv3Step,
  title: string,
  timeoutMs = MESSAGE_TIMEOUT_MS,
): Promise<T> {
  return runMv3Step(context, testInfo, step, title, () => withTimeout(
    popup.evaluate(async nextMessage => chrome.runtime.sendMessage(nextMessage), message) as Promise<T>,
    timeoutMs,
    `${title} exceeded ${timeoutMs}ms`,
  ));
}

export async function closeMv3Context(
  context: BrowserContext | undefined,
  testInfo: TestInfo,
): Promise<void> {
  if (!context) return;
  const closePromise = context.close();
  let timedOut = false;
  await Promise.race([
    closePromise,
    new Promise<void>(resolve => setTimeout(() => {
      timedOut = true;
      resolve();
    }, CLEANUP_TIMEOUT_MS)),
  ]);
  if (timedOut) {
    await attachDiagnostics(context, testInfo, 'context cleanup timeout', new Error('persistent browser context did not close within 5s'));
  }
  void closePromise.catch(() => undefined);
}

async function attachDiagnostics(
  context: BrowserContext | undefined,
  testInfo: TestInfo,
  stage: string,
  error: unknown,
): Promise<void> {
  const diagnostics = {
    stage,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    pages: context?.pages().map(page => page.url()) ?? [],
    serviceWorkers: context?.serviceWorkers().map(worker => worker.url()) ?? [],
    timestamp: new Date().toISOString(),
  };
  const filePath = testInfo.outputPath('mv3-readiness-diagnostics.json');
  await writeFile(filePath, `${JSON.stringify(diagnostics, null, 2)}\n`);
  await testInfo.attach('mv3-readiness-diagnostics', {
    path: filePath,
    contentType: 'application/json',
  });
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    operation.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
