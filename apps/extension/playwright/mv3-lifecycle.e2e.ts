import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import {
  closeMv3Context,
  openMv3Popup,
  runMv3Step,
  sendMv3Message,
  waitForMv3Worker,
  wakeMv3Worker,
  type Mv3Step,
} from './mv3-readiness';

const PORT = 3345;
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const E2E_SAVE = 'sploot:e2e:context-menu-save';
const LIST_QUEUE = 'sploot:context-menu-save:list-queue';
const DISCARD = 'sploot:context-menu-save:discard';
const RETRY = 'sploot:context-menu-save:retry';
const CAPTURE = 'CAPTURE_VISIBLE_TAB';

let server: Server;
let uploadMode: 'success' | 'failure' | 'duplicate' = 'success';
let imageBytes = 'original-image';
const uploadBodies: string[] = [];
const requestLog: string[] = [];

function json(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(body));
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    requestLog.push(`${request.method ?? 'UNKNOWN'} ${request.url ?? ''}`);
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'authorization, content-type');
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
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

test.beforeEach(() => {
  uploadBodies.length = 0;
  requestLog.length = 0;
  uploadMode = 'success';
  imageBytes = 'original-image';
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function openExtension(testInfo: import('@playwright/test').TestInfo, step: Mv3Step): Promise<{ context: BrowserContext; popup: Page; worker: Worker; extensionId: string }> {
  const extensionPath = path.resolve('dist/chrome-mv3');
  const context = await runMv3Step(undefined, testInfo, step, 'launch persistent unpacked MV3 Chrome', () => chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  }));
  const worker = await waitForMv3Worker(context, testInfo, step);
  await wakeMv3Worker(worker, context, testInfo, step);
  const extensionId = new URL(worker.url()).host;
  const popup = await openMv3Popup(context, extensionId, testInfo, step);
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

async function queue(worker: Worker) {
  return await worker.evaluate(async () => (await chrome.storage.local.get('sploot:context-menu-queue'))['sploot:context-menu-queue'] ?? []);
}

async function waitForQueue(
  worker: Worker,
  context: BrowserContext,
  testInfo: import('@playwright/test').TestInfo,
  step: Mv3Step,
  title: string,
  predicate: (jobs: any[]) => boolean,
) {
  await runMv3Step(context, testInfo, step, title, async () => {
    let lastJobs: any[] = [];
    try {
      await expect.poll(async () => {
        lastJobs = await queue(worker);
        return predicate(lastJobs);
      }, { timeout: 15_000 }).toBe(true);
    } catch (error) {
      throw new Error(`${title} timed out; queue=${JSON.stringify(lastJobs)} requests=${JSON.stringify(requestLog)}`, { cause: error });
    }
  });
}

async function stopAndRestart(
  context: BrowserContext,
  popup: Page,
  testInfo: import('@playwright/test').TestInfo,
  step: Mv3Step,
): Promise<Worker> {
  return runMv3Step(context, testInfo, step, 'service worker termination and bounded restart', async () => {
    const cdp = await context.newCDPSession(popup);
    const restarted = context.waitForEvent('serviceworker', {
      timeout: 15_000,
      predicate: candidate => candidate.url().startsWith('chrome-extension://'),
    });
    let wake: Promise<{ ok: boolean }> | undefined;
    try {
      const targets = await cdp.send('Target.getTargets');
      const target = targets.targetInfos.find(info => info.type === 'service_worker' && info.url.startsWith('chrome-extension://'));
      expect(target).toBeTruthy();
      await cdp.send('Target.closeTarget', { targetId: target!.targetId });
      wake = sendMv3Message<{ ok: boolean }>(
        popup,
        { type: LIST_QUEUE },
        context,
        testInfo,
        step,
        'wake restarted worker through real queue message',
      );
      const worker = await restarted;
      await wake;
      await wakeMv3Worker(worker, context, testInfo, step);
      return worker;
    } catch (error) {
      await wake?.catch(() => undefined);
      throw error;
    } finally {
      const detach = cdp.detach();
      await Promise.race([
        detach,
        new Promise<void>(resolve => setTimeout(resolve, 5_000)),
      ]);
      void detach.catch(() => undefined);
    }
  });
}

test('real unpacked MV3 lifecycle preserves bytes, owner fences, retries, and duplicates', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const step: Mv3Step = (title, body) => test.step(title, body);
  const opened = await openExtension(testInfo, step);
  let { context, popup, worker } = opened;
  const send = (message: Record<string, unknown>, title: string, timeoutMs?: number) => sendMv3Message(
    popup, message, context, testInfo, step, title, timeoutMs,
  );
  try {
    uploadMode = 'failure';
    imageBytes = 'original-image';
    await setAuth(worker, 'user-a');
    await send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'immutable.png' }, 'immutable save message');
    await waitForQueue(worker, context, testInfo, step, 'immutable bytes persisted', jobs => jobs.some(job => (
      job.filename === 'immutable.png' && job.sourceBytes
    )));
    const immutable = (await queue(worker)).find((job: any) => job.filename === 'immutable.png');
    expect(immutable.imageUrl).toBe(`${API_ORIGIN}/image.png`);

    await setAuth(worker, 'user-b');
    worker = await stopAndRestart(context, popup, testInfo, step);
    ({ context, popup } = opened);
    await waitForQueue(worker, context, testInfo, step, 'account switch pauses original-owner job', jobs => jobs.some(job => (
      job.id === immutable?.id && job.state === 'paused'
    )));
    const otherOwnerList = await send({ type: LIST_QUEUE }, 'different-owner queue-list message');
    expect(otherOwnerList).toEqual({ ok: true, jobs: [] });
    expect(JSON.stringify(otherOwnerList)).not.toContain('immutable.png');
    expect(await send({ type: DISCARD, jobId: immutable.id }, 'different-owner discard message')).toMatchObject({ ok: false });
    expect((await queue(worker)).some((job: any) => job.id === immutable.id)).toBe(true);

    await setAuth(worker, null);
    expect(await send({ type: LIST_QUEUE }, 'signed-out queue-list message')).toEqual({ ok: true, jobs: [] });
    expect(await send({ type: DISCARD, jobId: immutable.id }, 'signed-out discard message')).toMatchObject({ ok: false });

    await setAuth(worker, 'user-a');
    uploadMode = 'success';
    imageBytes = 'changed-image';
    expect(await send({ type: RETRY, jobId: immutable.id }, 'original-owner retry message')).toMatchObject({ ok: true });
    await stopAndRestart(context, popup, testInfo, step).then(next => { worker = next; });
    await waitForQueue(worker, context, testInfo, step, 'immutable retry converged', jobs => !jobs.some(job => job.id === immutable.id));
    expect(uploadBodies.some(body => body.includes('original-image'))).toBe(true);
    expect(uploadBodies.some(body => body.includes('changed-image'))).toBe(false);

    uploadMode = 'duplicate';
    await send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'duplicate.png' }, 'duplicate save message');
    await waitForQueue(worker, context, testInfo, step, 'duplicate replay converged', jobs => !jobs.some(job => job.filename === 'duplicate.png'));
    expect(uploadBodies.at(-1)).toContain('changed-image');

    uploadMode = 'failure';
    await send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'popup-discard.png' }, 'popup-discard save message');
    await waitForQueue(worker, context, testInfo, step, 'popup discard bytes persisted', jobs => jobs.some(job => (
      job.filename === 'popup-discard.png' && job.sourceBytes
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
    await waitForQueue(worker, context, testInfo, step, 'popup discard converged', jobs => !jobs.some(job => job.id === discardJob.id));

    const fixture = await context.newPage();
    await fixture.goto(`${API_ORIGIN}/fixture`);
    await fixture.bringToFront();
    uploadMode = 'failure';
    await send({ type: CAPTURE }, 'screenshot capture message');
    await waitForQueue(worker, context, testInfo, step, 'screenshot bytes persisted', jobs => jobs.some(job => (
      job.filename.startsWith('screenshot-') && job.sourceBytes
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
    worker = await stopAndRestart(context, popup, testInfo, step);
    await waitForQueue(worker, context, testInfo, step, 'screenshot retry converged', jobs => !jobs.some(job => job.id === screenshotJob.id));
    await fixture.close();

    uploadMode = 'success';
    const hungResults = await Promise.allSettled([
      send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/hung-1.png`, filename: 'hung-1.png' }, 'hung source 1 save message', 45_000),
      send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/hung-2.png`, filename: 'hung-2.png' }, 'hung source 2 save message', 45_000),
      send({ type: E2E_SAVE, imageUrl: `${API_ORIGIN}/image.png`, filename: 'after-hung.png' }, 'post-hung save message'),
    ]);
    expect(hungResults).toHaveLength(3);
    expect(uploadBodies.some(body => body.includes('after-hung.png'))).toBe(true);
  } finally {
    await closeMv3Context(context, testInfo);
  }
});
