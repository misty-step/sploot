import { createServer, type Server } from 'node:http';
import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import type { TestInfo } from '@playwright/test';
import {
  closeMv3Context,
  launchMv3Context,
  openMv3Popup,
  runMv3Step,
  sendMv3Message,
  waitForMv3Worker,
  wakeMv3Worker,
  type Mv3Step,
} from './mv3-readiness';
import { invokeBrowserActionShortcut, stopAndRestart } from './mv3-controls';
import { saveImageThroughContextMenu } from './mv3-context-menu';
import type { AuthState } from '../shared/auth-messages';
import type { ContextMenuSaveJob } from '../entrypoints/background/context-menu-save-queue';

const PORT = 3345;
const API_ORIGIN = `http://127.0.0.1:${PORT}`;
const NATIVE_SAVE = 'native-context-menu';
const LIST_QUEUE = 'sploot:context-menu-save:list-queue';
const DISCARD = 'sploot:context-menu-save:discard';
const RETRY = 'sploot:context-menu-save:retry';
const CAPTURE = 'CAPTURE_VISIBLE_TAB';

let server: Server;
type UploadMode = 'success' | 'failure' | 'duplicate';
let uploadMode: UploadMode = 'success';
let imageBytes = 'original-image';
const uploads: Array<{ body: Buffer; owner: string; mode: UploadMode }> = [];
const requestLog: string[] = [];
const workerConsole: string[] = [];
let fixtureAccount = 'user-a';
const deviceSessions = new Map<string, string>();
const deviceRequests = new Map<string, string>();

function json(response: ServerResponse, status: number, body: unknown) {
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
    if (request.url === '/api/auth/device' && request.method === 'POST') {
      const code = crypto.randomUUID();
      deviceRequests.set(code, fixtureAccount);
      json(response, 201, { deviceCode: code, userCode: 'FIXT-TEST',
        verificationUriComplete: `${API_ORIGIN}/app/connect?code=FIXT-TEST`, expiresIn: 600, interval: 2 });
      return;
    }
    if (request.url === '/api/auth/device/token') {
      let body = '';
      request.on('data', chunk => { body += chunk.toString(); });
      request.on('end', () => {
        const code = JSON.parse(body).deviceCode;
        const user = deviceRequests.get(code);
        if (!user) { json(response, 410, { error: 'expired' }); return; }
        deviceRequests.delete(code);
        const token = `spld_${crypto.randomUUID()}`;
        deviceSessions.set(token, user);
        json(response, 200, { status: 'authorized', token, user: { id: user, email: `${user}@fixture.test` },
          expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
      });
      return;
    }
    const bearer = request.headers.authorization?.replace(/^Bearer /, '');
    if (request.url === '/api/auth/device/session') {
      deviceSessions.delete(bearer ?? '');
      response.writeHead(204); response.end(); return;
    }
    if (request.url === '/api/auth/session') {
      const user = deviceSessions.get(bearer ?? '');
      json(response, user ? 200 : 401, user ? { user: { id: user, email: `${user}@fixture.test` } } : { error: 'unauthorized' });
      return;
    }
    if (request.url === '/fixture') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>MV3 fixture</title><h1>Sploot fixture</h1><img src="/image.png" alt="fixture image">');
      return;
    }
    if (request.url?.startsWith('/hung')) {
      // Deliberately leave the source response open; the extension's bounded
      // fetch admission and abort fence must let later work proceed.
      return;
    }
    if (request.url?.endsWith('.png')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.concat([
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE3sAAAAASUVORK5CYII=', 'base64'),
        Buffer.from(imageBytes),
      ]));
      return;
    }
    if (request.url === '/api/upload' && request.method === 'POST') {
      const owner = deviceSessions.get(bearer ?? '');
      if (!owner) { json(response, 401, { error: 'unauthorized' }); return; }
      const mode = uploadMode;
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        uploads.push({ body: Buffer.concat(chunks), owner, mode });
        if (mode === 'failure') {
          json(response, 503, { success: false, error: 'test failure', code: 'temporary' });
          return;
        }
        json(response, mode === 'duplicate' ? 409 : 201, {
          success: true,
          isDuplicate: mode === 'duplicate',
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
  uploads.length = 0;
  requestLog.length = 0;
  workerConsole.length = 0;
  uploadMode = 'success';
  imageBytes = 'original-image';
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function openExtension(testInfo: TestInfo, step: Mv3Step): Promise<{ context: BrowserContext; popup: Page; worker: Worker; extensionId: string }> {
  const extensionPath = path.resolve('dist/chrome-mv3');
  const context = await runMv3Step(undefined, testInfo, step, 'launch persistent unpacked MV3 Chrome', () => launchMv3Context(extensionPath));
  const worker = await waitForMv3Worker(context, testInfo, step);
  observeWorker(worker);
  await wakeMv3Worker(worker, context, testInfo, step);
  const extensionId = new URL(worker.url()).host;
  const popup = await openMv3Popup(context, extensionId, testInfo, step);
  return { context, popup, worker, extensionId };
}

function observeWorker(worker: Worker): void {
  worker.on('console', message => {
    workerConsole.push(`[${message.type()}] ${message.text().replaceAll(/user-[ab]/g, '<owner>')}`);
  });
}

async function screenshotRuntimeDiagnostics(worker: Worker) {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get(['sploot:last-save', 'sploot:context-menu-queue']);
    const notifications = await chrome.notifications.getAll();
    const jobs = Array.isArray(stored['sploot:context-menu-queue'])
      ? (stored['sploot:context-menu-queue'] as Array<Record<string, unknown>>).map(job => ({
        filename: job.filename,
        state: job.state,
        hasSourceBytes: Boolean(job.sourceBytes),
      }))
      : [];
    return {
      saveStatus: stored['sploot:last-save'] ?? null,
      notificationIds: Object.keys(notifications),
      jobs,
    };
  });
}

async function connectAccount(popup: Page, userId: string | null): Promise<AuthState> {
  const disconnected = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'AUTH_DISCONNECT' }));
  expect(disconnected.error).toBeUndefined();
  expect(disconnected.state).toMatchObject({ status: 'signed-out' });
  if (!userId) return disconnected.state;
  fixtureAccount = userId;
  const configured = await popup.evaluate(async instanceUrl => chrome.runtime.sendMessage({ type: 'AUTH_SET_INSTANCE', instanceUrl }), API_ORIGIN);
  expect(configured.error).toBeUndefined();
  const pairing = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'AUTH_CONNECT' }));
  expect(pairing.error).toBeUndefined();
  let state: AuthState | undefined;
  await expect.poll(async () => {
    const response = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'AUTH_REQUEST_STATE' }));
    state = response.state;
    return state;
  }).toMatchObject({ status: 'signed-in', instanceUrl: API_ORIGIN, userId, sessionId: expect.any(String) });
  return state!;
}

async function queue(worker: Worker) {
  return await worker.evaluate(async () => (await chrome.storage.local.get('sploot:context-menu-queue'))['sploot:context-menu-queue'] ?? []);
}

async function waitForQueue(
  worker: Worker,
  context: BrowserContext,
  testInfo: TestInfo,
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
async function retainFailedSave(
  worker: Worker,
  context: BrowserContext,
  testInfo: TestInfo,
  step: Mv3Step,
  filename: string,
): Promise<ContextMenuSaveJob> {
  await waitForQueue(worker, context, testInfo, step, `${filename} first failed attempt settled`, jobs => jobs.some(job => (
    job.filename === filename && job.sourceBytes && job.state === 'pending' && job.attempts >= 1 && job.lastError
  )));
  // Skip backoff exhaustion in this controlled fixture, not capture, upload,
  // or pairing. Only the already-failed, settled native capture is retained.
  return worker.evaluate(async filename => {
    const stored = await chrome.storage.local.get('sploot:context-menu-queue');
    const jobs = stored['sploot:context-menu-queue'] as ContextMenuSaveJob[];
    const job = jobs.find(candidate => candidate.filename === filename);
    if (!job || job.state !== 'pending' || !job.lastError || job.attempts < 1) {
      throw new Error(`No settled failed attempt for ${filename}`);
    }
    const failed: ContextMenuSaveJob = { ...job, state: 'failed', nextAttemptAt: 0, failedAt: Date.now() };
    await chrome.storage.local.set({
      'sploot:context-menu-queue': jobs.map(candidate => candidate.id === job.id ? failed : candidate),
    });
    return failed;
  }, filename);
}


test('controlled API fixture: real MV3 worker preserves bytes, owner fences, retries, and receipts', async ({}, testInfo) => {
  test.setTimeout(120_000);
  const step: Mv3Step = (title, body) => test.step(title, body);
  const opened = await openExtension(testInfo, step);
  let { context, popup, worker } = opened;
  const send = async <T = unknown>(message: Record<string, unknown>, title: string, timeoutMs?: number): Promise<T> => {
    if (message.type === NATIVE_SAVE) {
      const previousUploads = uploads.length;
      await saveImageThroughContextMenu(context, String(message.imageUrl));
      await expect.poll(() => uploads.slice(previousUploads).some(upload => upload.body.includes(String(message.filename))), { timeout: 15_000 }).toBe(true);
      return { ok: true } as T;
    }
    return sendMv3Message<T>(popup, message, context, testInfo, step, title, timeoutMs);
  };
  try {
    uploadMode = 'failure';
    imageBytes = 'original-image';
    const firstSession = await connectAccount(popup, 'user-a');
    await send({ type: NATIVE_SAVE, imageUrl: `${API_ORIGIN}/immutable.png`, filename: 'immutable.png' }, 'immutable native context-menu save');
    await waitForQueue(worker, context, testInfo, step, 'immutable first failed attempt settled', jobs => jobs.some(job => (
      job.filename === 'immutable.png' && job.sourceBytes && job.state === 'pending' && job.attempts >= 1
    )));
    const immutable = (await queue(worker)).find((job: ContextMenuSaveJob) => job.filename === 'immutable.png') as ContextMenuSaveJob;
    expect(immutable.imageUrl).toBe(`${API_ORIGIN}/immutable.png`);
    const immutableBytes = Buffer.from(immutable.sourceBytes!, 'base64');
    expect(createHash('sha256').update(immutableBytes).digest('hex')).toBe(immutable.sourceSha256);

    // A paused save resumes automatically; a terminal failure remains available
    // for an explicit Retry. Keep both lifecycles across the same reconnect.
    await send({ type: NATIVE_SAVE, imageUrl: `${API_ORIGIN}/manual-retry.png`, filename: 'manual-retry.png' }, 'manual-retry native context-menu save');
    const manualRetry = await retainFailedSave(worker, context, testInfo, step, 'manual-retry.png');
    const manualBytes = Buffer.from(manualRetry.sourceBytes!, 'base64');
    expect(createHash('sha256').update(manualBytes).digest('hex')).toBe(manualRetry.sourceSha256);

    const uploadsBeforeSwitch = uploads.length;
    await connectAccount(popup, 'user-b');
    worker = await stopAndRestart(context, popup, worker, testInfo, step);
    await waitForQueue(worker, context, testInfo, step, 'account switch pauses original-owner job', jobs => jobs.some(job => (
      job.id === immutable.id && job.state === 'paused'
    )));
    const otherOwnerList = await send({ type: LIST_QUEUE }, 'different-owner queue-list message');
    expect(otherOwnerList).toEqual({ ok: true, jobs: [] });
    expect(JSON.stringify(otherOwnerList)).not.toContain('immutable.png');
    expect(await send({ type: RETRY, jobId: manualRetry.id }, 'different-owner retry message')).toMatchObject({ ok: false });
    expect(await send({ type: DISCARD, jobId: immutable.id }, 'different-owner discard message')).toMatchObject({ ok: false });
    expect((await queue(worker)).some((job: ContextMenuSaveJob) => job.id === immutable.id)).toBe(true);

    await connectAccount(popup, null);
    expect(await send({ type: LIST_QUEUE }, 'signed-out queue-list message')).toEqual({ ok: true, jobs: [] });
    expect(await send({ type: RETRY, jobId: manualRetry.id }, 'signed-out retry message')).toMatchObject({ ok: false });
    expect(await send({ type: DISCARD, jobId: immutable.id }, 'signed-out discard message')).toMatchObject({ ok: false });
    expect(uploads).toHaveLength(uploadsBeforeSwitch);

    // Set the resumed request's outcome before pairing publishes signed-in:
    // re-authentication itself may already have completed the paused save.
    uploadMode = 'success';
    imageBytes = 'changed-image';
    const reconnected = await connectAccount(popup, 'user-a');
    expect(reconnected.sessionId).not.toBe(firstSession.sessionId);
    await waitForQueue(worker, context, testInfo, step, 'same-account reconnect resumes original bytes', jobs => !jobs.some(job => job.id === immutable.id));
    const resumed = uploads.slice(uploadsBeforeSwitch).filter(upload => upload.body.includes('immutable.png'));
    expect(resumed).not.toHaveLength(0);
    for (const upload of resumed) {
      expect(upload.owner).toBe('user-a');
      expect(upload.mode).toBe('success');
      expect(upload.body.includes(immutableBytes)).toBe(true);
      expect(upload.body.includes('changed-image')).toBe(false);
    }
    await expect.poll(async () => (await screenshotRuntimeDiagnostics(worker)).saveStatus).toMatchObject({
      state: 'success', filename: 'immutable.png', isDuplicate: false,
    });

    const newSessionList = await send<{ ok: boolean; jobs: Array<{ id: string }> }>(
      { type: LIST_QUEUE },
      'same-account new-session retained-failure list',
    );
    expect(newSessionList.ok).toBe(true);
    expect(newSessionList.jobs.some(job => job.id === manualRetry.id)).toBe(true);
    const uploadsBeforeRetry = uploads.length;
    expect(await send({ type: RETRY, jobId: manualRetry.id }, 'same-account new-session explicit retry')).toMatchObject({ ok: true });
    worker = await stopAndRestart(context, popup, worker, testInfo, step);
    await waitForQueue(worker, context, testInfo, step, 'explicit immutable retry converged after restart', jobs => !jobs.some(job => job.id === manualRetry.id));
    const retried = uploads.slice(uploadsBeforeRetry).filter(upload => upload.body.includes('manual-retry.png'));
    expect(retried).not.toHaveLength(0);
    for (const upload of retried) {
      expect(upload.owner).toBe('user-a');
      expect(upload.mode).toBe('success');
      expect(upload.body.includes(manualBytes)).toBe(true);
      expect(upload.body.includes('changed-image')).toBe(false);
    }
    await expect.poll(async () => (await screenshotRuntimeDiagnostics(worker)).saveStatus).toMatchObject({
      state: 'success', filename: 'manual-retry.png', isDuplicate: false,
    });

    uploadMode = 'duplicate';
    await send({ type: NATIVE_SAVE, imageUrl: `${API_ORIGIN}/duplicate.png`, filename: 'duplicate.png' }, 'duplicate native context-menu save');
    await waitForQueue(worker, context, testInfo, step, 'duplicate replay converged', jobs => !jobs.some(job => job.filename === 'duplicate.png'));
    expect(uploads.at(-1)!.body.includes('changed-image')).toBe(true);
    // A previous account's invisible terminal failures must never wedge this
    // profile: a full foreign-owner queue is reclaimed deterministically
    // (oldest terminal job evicted, never uploaded) and the new save lands.
    await runMv3Step(context, testInfo, step, 'seed a full foreign-owner failed queue', async () => {
      await worker.evaluate(async () => {
        const jobs = Array.from({ length: 50 }, (_, index) => ({
          id: `foreign-wedge-${index}`,
          imageUrl: `https://private.invalid/wedge-${index}.png`,
          filename: `foreign-wedge-${index}.png`,
          state: 'failed',
          createdAt: Date.now() - (50 - index) * 1_000,
          attempts: 5,
          nextAttemptAt: 0,
          failedAt: Date.now() - 1_000,
          lastError: 'foreign failure',
          owner: { userId: 'user-old', accountId: 'user-old', sessionId: 'session-old' },
          sourceBytes: btoa('foreign-bytes'),
          sourceType: 'image/png',
        }));
        await chrome.storage.local.set({ 'sploot:context-menu-queue': jobs });
      });
    });
    uploadMode = 'success';
    await send({ type: NATIVE_SAVE, imageUrl: `${API_ORIGIN}/reclaimed.png`, filename: 'reclaimed.png' }, 'save through wedged queue');
    await waitForQueue(worker, context, testInfo, step, 'wedged queue reclaimed and save converged', jobs => (
      !jobs.some(job => job.filename === 'reclaimed.png')
      && jobs.length === 49
      && !jobs.some(job => job.id === 'foreign-wedge-0')
      && jobs.some(job => job.id === 'foreign-wedge-1')
    ));
    expect(uploads.some(upload => upload.body.includes('reclaimed.png'))).toBe(true);
    expect(uploads.every(upload => !upload.body.includes('foreign-wedge'))).toBe(true);
    await runMv3Step(context, testInfo, step, 'clear reclaimed foreign queue', async () => {
      await worker.evaluate(async () => {
        await chrome.storage.local.set({ 'sploot:context-menu-queue': [] });
      });
    });

    uploadMode = 'failure';
    await send({ type: NATIVE_SAVE, imageUrl: `${API_ORIGIN}/popup-discard.png`, filename: 'popup-discard.png' }, 'popup-discard native save');
    const discardJob = await retainFailedSave(worker, context, testInfo, step, 'popup-discard.png');
    await popup.reload();
    // Scope to the queue strip: the persistent last-save strip may also name
    // this file ("Retry scheduled for popup-discard.png.").
    await expect(popup.locator('.save-strip.queue-failure').getByText('popup-discard.png')).toBeVisible();
    await popup.getByRole('button', { name: 'Discard' }).click();
    await waitForQueue(worker, context, testInfo, step, 'popup discard converged', jobs => !jobs.some(job => job.id === discardJob.id));

    const fixture = await context.newPage();
    await fixture.goto(`${API_ORIGIN}/fixture`);
    await fixture.bringToFront();
    await runMv3Step(context, testInfo, step, 'active HTTP screenshot tab', async () => {
      const activeTab = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return { url: tab?.url ?? null, windowId: tab?.windowId ?? null };
      });
      expect(activeTab).toEqual({ url: `${API_ORIGIN}/fixture`, windowId: expect.any(Number) });
    });
    await runMv3Step(context, testInfo, step, 'real browser-action keyboard activation', async () => {
      // This is a real Chrome command invocation on the active HTTP tab. It
      // grants activeTab transiently; the following capture remains the normal
      // production background message, never a test-only capture substitute.
      await invokeBrowserActionShortcut(fixture);
      await expect.poll(async () => worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return tab?.url ?? null;
      }), { timeout: 5_000 }).toBe(`${API_ORIGIN}/fixture`);
    });
    uploadMode = 'failure';
    const captureResult = await send<{
      completed: boolean;
      stage?: string;
      reason?: string;
    }>({ type: CAPTURE }, 'screenshot capture message');
    await runMv3Step(context, testInfo, step, 'screenshot capture acknowledged by background', async () => {
      if (!captureResult.completed) {
        const runtime = await screenshotRuntimeDiagnostics(worker);
        throw new Error([
          `screenshot capture failed: ${JSON.stringify(captureResult)}`,
          `runtime=${JSON.stringify(runtime)}`,
          `workerConsole=${JSON.stringify(workerConsole)}`,
          `requests=${JSON.stringify(requestLog)}`,
        ].join(' '));
      }
      expect(captureResult).toEqual({ completed: true });
    });
    await waitForQueue(worker, context, testInfo, step, 'screenshot first failed attempt settled', jobs => jobs.some(job => (
      job.filename.startsWith('screenshot-')
      && job.sourceBytes
      && /^[a-f0-9]{64}$/.test(job.sourceSha256)
      && job.owner?.userId === 'user-a'
      && job.state === 'pending'
      && job.attempts >= 1
    )));
    const screenshotJob = (await queue(worker)).find((job: any) => job.filename.startsWith('screenshot-'));
    expect(screenshotJob.imageUrl).toContain('captured://');
    expect(screenshotJob.filename).toMatch(/^screenshot-127\.0\.0\.1-\d+\.png$/);
    const screenshotBytes = Buffer.from(screenshotJob.sourceBytes, 'base64');
    expect(screenshotBytes.length).toBeGreaterThan(0);
    expect(createHash('sha256').update(screenshotBytes).digest('hex')).toBe(screenshotJob.sourceSha256);
    const uploadsBeforeScreenshotRetry = uploads.length;
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
    worker = await stopAndRestart(context, popup, worker, testInfo, step);
    await waitForQueue(worker, context, testInfo, step, 'screenshot retry converged', jobs => !jobs.some(job => job.id === screenshotJob.id));
    expect(uploads.slice(uploadsBeforeScreenshotRetry).some(upload => (
      upload.owner === 'user-a' && upload.mode === 'duplicate' && upload.body.includes(screenshotBytes)
    ))).toBe(true);
    await fixture.close();

  } finally {
    await closeMv3Context(context, testInfo);
  }
});
