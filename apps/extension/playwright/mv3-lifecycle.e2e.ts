import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { closeMv3Context, launchMv3Context, openMv3Popup, waitForMv3Worker, type Mv3Step } from './mv3-readiness';
import { invokeBrowserActionShortcut, stopAndRestart } from './mv3-controls';
import { saveImageThroughContextMenu } from './mv3-context-menu';
import type { AuthResponse } from '../shared/auth-messages';

const INSTANCE = process.env.SPLOOT_E2E_BASE_URL ?? 'http://127.0.0.1:3001';
const SOURCE = 'http://127.0.0.1:3346';
let source: Server;
let original: Buffer;
interface Asset { id: string; filename: string; blobUrl: string; embeddingStatus: string }

// This server serves source media ONLY. Every account, device, upload, stored
// original, duplicate receipt, and search below comes from the actual Go app.
test.beforeAll(async () => {
  original = await sharp({ create: { width: 192, height: 192, channels: 3, background: '#7547e8' } }).png().toBuffer();
  source = createServer((request, response) => {
    if (request.url === '/purple-square.png') {
      response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      response.end(original);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>MV3 fixture</title><h1>Purple square capture</h1><img width="192" height="192" src="/purple-square.png" alt="A purple square">');
  });
  const listening = Promise.withResolvers<void>();
  source.once('error', listening.reject);
  source.listen(3346, '127.0.0.1', listening.resolve);
  await listening.promise;
});
test.afterAll(async () => {
  const closed = Promise.withResolvers<void>();
  source.closeAllConnections();
  source.close(error => error ? closed.reject(error) : closed.resolve());
  await closed.promise;
});

async function readAuth(popup: Page): Promise<AuthResponse> {
  return popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'AUTH_REQUEST_STATE' }));
}

async function approvePairing(context: BrowserContext, popup: Page, email: string): Promise<void> {
  await popup.getByRole('button', { name: 'Connect device', exact: true }).click();
  await expect.poll(async () => (await readAuth(popup)).state?.pending?.userCode).toBeTruthy();
  const pending = (await readAuth(popup)).state!.pending!;
  await expect(popup.getByLabel('Connection code')).toHaveText(pending.userCode);
  const approval = context.pages().find(page => page.url().startsWith(`${INSTANCE}/app/connect`)) ?? await context.newPage();
  await approval.goto(pending.verificationUriComplete);
  await approval.getByRole('button', { name: 'Approve connection', exact: true }).click();
  await expect(popup.getByText(email, { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function deviceRequest(worker: Worker, request: { path: string; method?: string; body?: object }) {
  return worker.evaluate(async input => {
    const value = (await chrome.storage.local.get('sploot:connection'))['sploot:connection'];
    const response = await fetch(`${value.instanceUrl}${input.path}`, {
      method: input.method ?? 'GET', credentials: 'omit', redirect: 'error',
      headers: { Authorization: `Bearer ${value.session.token}`, 'Content-Type': 'application/json' },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }, request);
}

test('actual Go backend: pair across worker restart, capture originals, search, duplicate, revoke, isolate accounts', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const step: Mv3Step = (title, body) => test.step(title, body);
  let context: BrowserContext | undefined;
  try {
    const extensionPath = path.resolve('dist/chrome-mv3');
    context = await launchMv3Context(extensionPath);
    const health = await context.request.get(`${INSTANCE}/api/health`);
    expect(health.ok(), `A real Go instance with prepared inference must be running at ${INSTANCE}`).toBe(true);
    const password = `Extension-${randomUUID()}-A9`;
    const emailA = `extension-a-${randomUUID()}@example.test`;
    const emailB = `extension-b-${randomUUID()}@example.test`;
    const registered = await context.request.post(`${INSTANCE}/api/auth/register`, {
      headers: { Origin: INSTANCE }, data: { email: emailA, password },
    });
    expect(registered.status()).toBe(201);
    let worker = await waitForMv3Worker(context, testInfo, step);
    const extensionId = new URL(worker.url()).host;
    const popup = await openMv3Popup(context, extensionId, testInfo, step);
    await popup.getByLabel('Instance URL').fill(INSTANCE);
    if (await popup.getByRole('button', { name: 'Use instance' }).isVisible()) await popup.getByRole('button', { name: 'Use instance' }).click();
    await popup.getByRole('button', { name: 'Connect device', exact: true }).click();
    await expect.poll(async () => (await readAuth(popup)).state?.pending?.userCode).toBeTruthy();
    const pending = (await readAuth(popup)).state!.pending!;
    worker = await stopAndRestart(context, popup, worker, testInfo, step);
    expect((await readAuth(popup)).state?.pending?.userCode).toBe(pending.userCode);
    const approval = await context.newPage();
    await approval.goto(pending.verificationUriComplete);
    await approval.getByRole('button', { name: 'Approve connection', exact: true }).click();
    await expect(popup.getByText(emailA, { exact: true })).toBeVisible({ timeout: 15_000 });

    const listAssets = async (): Promise<Asset[]> => {
      const response = await context!.request.get(`${INSTANCE}/api/assets`);
      expect(response.status()).toBe(200);
      return (await response.json()).assets;
    };
    await saveImageThroughContextMenu(context, `${SOURCE}/purple-square.png`);
    await expect.poll(async () => (await listAssets()).length, { timeout: 30_000 }).toBe(1);
    const asset = (await listAssets())[0];
    const downloaded = await context.request.get(new URL(asset.blobUrl, INSTANCE).href);
    expect(downloaded.status()).toBe(200);
    expect(createHash('sha256').update(await downloaded.body()).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));

    await saveImageThroughContextMenu(context, `${SOURCE}/purple-square.png`);
    await expect.poll(async () => worker.evaluate(async () => (await chrome.storage.local.get('sploot:last-save'))['sploot:last-save']?.isDuplicate), { timeout: 30_000 }).toBe(true);
    expect(await listAssets()).toHaveLength(1);
    await expect.poll(async () => (await listAssets())[0].embeddingStatus, { timeout: 60_000 }).toBe('ready');
    const search = await deviceRequest(worker, { path: '/api/search', method: 'POST', body: { query: 'a purple square', threshold: 0, limit: 10 } });
    expect(search.status).toBe(200);
    expect(search.body.results.map((result: Asset) => result.id)).toContain(asset.id);

    const fixture = await context.newPage();
    await fixture.goto(`${SOURCE}/fixture`);
    await fixture.bringToFront();
    await invokeBrowserActionShortcut(fixture);
    const capture = await popup.evaluate(async () => chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }));
    expect(capture).toEqual({ completed: true });
    await expect.poll(async () => (await listAssets()).some(item => item.filename.startsWith('screenshot-')), { timeout: 30_000 }).toBe(true);
    await testInfo.attach('connected-popup', { body: await popup.screenshot(), contentType: 'image/png' });

    await popup.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Connect device', exact: true })).toBeVisible();
    const devices = await context.request.get(`${INSTANCE}/api/auth/devices`);
    expect((await devices.json()).devices).toEqual([]);
    await context.request.post(`${INSTANCE}/api/auth/logout`, { headers: { Origin: INSTANCE } });
    const other = await context.request.post(`${INSTANCE}/api/auth/register`, { headers: { Origin: INSTANCE }, data: { email: emailB, password } });
    expect(other.status()).toBe(201);
    await approvePairing(context, popup, emailB);
    expect(await listAssets()).toEqual([]);
    const foreign = await deviceRequest(worker, { path: `/api/assets/${asset.id}` });
    expect(foreign.status).toBe(404);
    const privateSearch = await deviceRequest(worker, { path: '/api/search', method: 'POST', body: { query: 'a purple square', threshold: 0 } });
    expect(privateSearch.status).toBe(200);
    expect(privateSearch.body.results).toEqual([]);
    await popup.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Connect device', exact: true })).toBeVisible();
  } finally {
    await closeMv3Context(context, testInfo);
  }
});
