import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

const PORT = 3345;
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const AUTH_KEY = 'sploot:e2e-auth-authority';
const QUEUE_KEY = 'sploot:context-menu-queue';
const E2E_SAVE = 'sploot:e2e:context-menu-save';
const LIST_QUEUE = 'sploot:context-menu-save:list-queue';
const DISCARD = 'sploot:context-menu-save:discard';
const CAPTURE = 'CAPTURE_VISIBLE_TAB';

let server: Server;
let uploadMode: 'success' | 'failure' | 'duplicate' = 'success';
let imageBytes = 'original-image';
const uploadBodies: string[] = [];

function json(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(body));
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.url === '/fixture') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>MV3 fixture</title><h1>Sploot fixture</h1><img src="/image.png" alt="fixture image">');
      return;
    }
    if (request.url === '/image.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from(imageBytes));
      return;
    }
    if (request.url?.startsWith('/hung')) {
      // Deliberately leave the source response open; the extension's bounded
      // fetch admission and abort fence must let later work proceed.
      return;
    }
    if (request.url === '/api/upload' && request.method === 'POST') {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        uploadBodies.push(Buffer.concat(chunks).toString('utf8'));
        if (uploadMode === 'failure') {
          json(response, 503, { success: false, error: 'test failure', code: 'temporary' });
          return;
        }
        json(response, uploadMode === 'duplicate' ? 409 : 201, {
          success: true,
          isDuplicate: uploadMode === 'duplicate',
          asset: {
            id: 'e2e-asset',
            blobUrl: `${API_ORIGIN}/blob/e2e-asset`,
            thumbnailUrl: `${API_ORIGIN}/blob/e2e-asset-thumb`,
            pathname: 'e2e-asset',
            filename: 'e2e.png',
            mimeType: 'image/png',
            size: 16,
            checksum: 'sha256:e2e',
            createdAt: new Date().toISOString(),
            needsEmbedding: false,
          },
        });
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>(resolve => server.listen(PORT, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function openExtension(): Promise<{ context: BrowserContext; popup: Page; worker: Worker; extensionId: string }> {
  const extensionPath = path.resolve('dist/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chrome',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return { context, popup, worker, extensionId };
}

async function setAuth(worker: Worker, userId: string | null) {
  await worker.evaluate(async ({ userId: nextUserId }) => {
    await chrome.storage.local.set({
      'sploot:e2e-auth-authority': nextUserId
        ? { userId: nextUserId, accountId: nextUserId, sessionId: `session-${nextUserId}` }
        : null,
    });
  }, { userId });
}

async function send(popup: Page, message: Record<string, unknown>) {
  return await popup.evaluate(async nextMessage => chrome.runtime.sendMessage(nextMessage), message);
}

async function queue(worker: Worker) {
  return await worker.evaluate(async () => (await chrome.storage.local.get('sploot:context-menu-queue'))['sploot:context-menu-queue'] ?? []);
}

async function waitForQueue(worker: Worker, predicate: (jobs: any[]) => boolean) {
  await expect.poll(async () => predicate(await queue(worker)), { timeout: 15_000 }).toBe(true);
}

async function stopAndRestart(context: BrowserContext, popup: Page): Promise<Worker> {
  const cdp = await context.newCDPSession(popup);
  const targets = await cdp.send('Target.getTargets');
  const target = targets.targetInfos.find(info => info.type === 'service_worker' && info.url.startsWith('chrome-extension://'));
  expect(target).toBeTruthy();
  await cdp.send('Target.closeTarget', { targetId: target!.targetId });
  return await context.waitForEvent('serviceworker');
}

test('real unpacked MV3 lifecycle preserves bytes, owner fences, retries, and duplicates', async () => {
  test.setTimeout(120_000);
  const opened = await openExtension();
  let { context, popup, worker } = opened;
  try {
    uploadMode = 'failure';
    imageBytes = 'original-image';
    await setAuth(worker, 'user-a');
    await send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'immutable.png' });
    await waitForQueue(worker, jobs => jobs.some(job => (
      job.filename === 'immutable.png' && job.sourceBytes && job.state !== 'processing'
    )));
    const immutable = (await queue(worker)).find((job: any) => job.filename === 'immutable.png');
    expect(immutable.imageUrl).toBe(`${API_ORIGIN}/image.png`);

    worker = await stopAndRestart(context, popup);
    ({ context, popup } = opened);
    await setAuth(worker, 'user-b');
    const otherOwnerList = await send(popup, { type: LIST_QUEUE });
    expect(otherOwnerList).toEqual({ ok: true, jobs: [] });
    expect(JSON.stringify(otherOwnerList)).not.toContain('immutable.png');
    expect(await send(popup, { type: DISCARD, jobId: immutable.id })).toMatchObject({ ok: false });
    expect((await queue(worker)).some((job: any) => job.id === immutable.id)).toBe(true);

    await setAuth(worker, null);
    expect(await send(popup, { type: LIST_QUEUE })).toEqual({ ok: true, jobs: [] });
    expect(await send(popup, { type: DISCARD, jobId: immutable.id })).toMatchObject({ ok: false });

    await setAuth(worker, 'user-a');
    uploadMode = 'success';
    imageBytes = 'changed-image';
    await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get('sploot:context-menu-queue');
      const jobs = (stored['sploot:context-menu-queue'] as any[]).map(job => ({ ...job, nextAttemptAt: Date.now() }));
      await chrome.storage.local.set({ 'sploot:context-menu-queue': jobs });
    });
    await stopAndRestart(context, popup).then(next => { worker = next; });
    await waitForQueue(worker, jobs => !jobs.some(job => job.id === immutable.id));
    expect(uploadBodies.some(body => body.includes('original-image'))).toBe(true);
    expect(uploadBodies.some(body => body.includes('changed-image'))).toBe(false);

    uploadMode = 'duplicate';
    await send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'duplicate.png' });
    await waitForQueue(worker, jobs => !jobs.some(job => job.filename === 'duplicate.png'));
    expect(uploadBodies.at(-1)).toContain('changed-image');

    uploadMode = 'failure';
    await send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'popup-discard.png' });
    await waitForQueue(worker, jobs => jobs.some(job => (
      job.filename === 'popup-discard.png' && job.sourceBytes && job.state !== 'processing'
    )));
    await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get('sploot:context-menu-queue');
      const jobs = (stored['sploot:context-menu-queue'] as any[]).map(job => job.filename === 'popup-discard.png'
        ? { ...job, state: 'failed', nextAttemptAt: 0, failedAt: Date.now(), lastError: 'test failure' }
        : job);
      await chrome.storage.local.set({ 'sploot:context-menu-queue': jobs });
    });
    await popup.reload();
    await expect(popup.getByText('popup-discard.png')).toBeVisible();
    const discardJob = (await queue(worker)).find((job: any) => job.filename === 'popup-discard.png');
    await popup.getByRole('button', { name: 'Discard' }).click();
    await waitForQueue(worker, jobs => !jobs.some(job => job.id === discardJob.id));

    const fixture = await context.newPage();
    await fixture.goto(`${API_ORIGIN}/fixture`);
    await fixture.bringToFront();
    uploadMode = 'failure';
    await send(popup, { type: CAPTURE });
    await waitForQueue(worker, jobs => jobs.some(job => (
      job.filename.startsWith('screenshot-') && job.sourceBytes && job.state !== 'processing'
    )));
    const screenshotJob = (await queue(worker)).find((job: any) => job.filename.startsWith('screenshot-'));
    expect(screenshotJob.imageUrl).toContain('captured://');
    uploadMode = 'duplicate';
    await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get('sploot:context-menu-queue');
      const jobs = (stored['sploot:context-menu-queue'] as any[]).map(job => (
        job.filename.startsWith('screenshot-')
          ? { ...job, state: 'pending', nextAttemptAt: Date.now() }
          : job
      ));
      await chrome.storage.local.set({ 'sploot:context-menu-queue': jobs });
    });
    worker = await stopAndRestart(context, popup);
    await waitForQueue(worker, jobs => !jobs.some(job => job.id === screenshotJob.id));
    await fixture.close();

    uploadMode = 'success';
    const hungResults = await Promise.allSettled([
      send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/hung-1.png`, filename: 'hung-1.png' }),
      send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/hung-2.png`, filename: 'hung-2.png' }),
      send(popup, { type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'after-hung.png' }),
    ]);
    expect(hungResults).toHaveLength(3);
    expect(uploadBodies.some(body => body.includes('after-hung.png'))).toBe(true);
  } finally {
    await context.close();
  }
});
