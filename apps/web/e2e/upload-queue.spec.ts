import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';
import { deriveUploadOwnerKey } from '../lib/upload/upload-owner';

const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const qaHeader = getQaLocalAuthHeader();

type QueueRow = {
  id: string;
  ownerKey: string;
  intent: 'file' | 'url';
  filename: string;
  mimeType: string;
  size: number;
  lastModified: number;
  sourceUrl?: string;
  addedAt: number;
  firstAddedAt: number;
  attemptStartedAt: number;
  status: 'pending' | 'uploading' | 'failed' | 'terminal';
  retryCount: number;
  claimGeneration: number;
  claimOwner?: string;
  claimToken?: string;
  claimExpiresAt?: number;
};

async function ownerKey(userId: string): Promise<string> {
  return deriveUploadOwnerKey(userId);
}

async function tokenFor(userId: string): Promise<string> {
  return createQaLocalAuthToken({
    userId,
    email: `${userId}@sploot.test`,
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
}

async function openApp(page: Page, userId: string): Promise<void> {
  await page.setExtraHTTPHeaders({ [qaHeader]: await tokenFor(userId) });
  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
  await waitForUploadReady(page);
}

async function waitForUploadReady(page: Page): Promise<void> {
  const uploadButton = page.getByRole('button', { name: 'Choose files to upload' });
  await expect(uploadButton).toBeVisible();
  await expect(uploadButton).toHaveAttribute('data-upload-ready', 'true');
}

async function establishOrigin(page: Page, userId: string): Promise<void> {
  await page.setExtraHTTPHeaders({ [qaHeader]: await tokenFor(userId) });
  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
}

async function waitForBrowserHealth(page: Page, timeoutMs = 10_000): Promise<void> {
  const response = await page.goto('/api/health', { waitUntil: 'commit', timeout: timeoutMs });
  const body = await response?.json() as { status?: string } | undefined;
  expect(response?.ok()).toBe(true);
  expect(response?.status()).toBe(200);
  expect(body).toMatchObject({ status: 'ok' });
}

async function openSignedOutApp(page: Page): Promise<void> {
  await waitForBrowserHealth(page);
  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
}

function intentList(page: Page) {
  return page.getByTestId('upload-intent-list');
}

function durableQueue(page: Page) {
  return page.getByTestId('durable-upload-queue');
}

async function waitForControllerTransition(page: Page, timeoutMs = 5_000): Promise<boolean> {
  return page.evaluate(async (timeout) => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (controlled: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(controlled);
      };
      const onControllerChange = () => finish(Boolean(navigator.serviceWorker.controller));
      timer = setTimeout(() => finish(Boolean(navigator.serviceWorker.controller)), timeout);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
      if (navigator.serviceWorker.controller) finish(true);
    });
  }, timeoutMs);
}

async function readRows(page: Page, requestedOwnerKey?: string): Promise<QueueRow[]> {
  return page.evaluate(async (requestedOwnerKey) => new Promise<QueueRow[]>((resolve, reject) => {
    const request = indexedDB.open('sploot_uploads', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('pending_uploads', 'readonly');
      const store = transaction.objectStore('pending_uploads');
      const read = requestedOwnerKey
        ? store.index('ownerKey').getAll(IDBKeyRange.only(requestedOwnerKey))
        : store.getAll();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => resolve(read.result as QueueRow[]);
    };
  }), requestedOwnerKey);
}

async function readPayloadIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('sploot_uploads', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('upload_payloads', 'readonly');
      const read = transaction.objectStore('upload_payloads').getAllKeys();
      read.onerror = () => reject(read.error);
      read.onsuccess = () => resolve(read.result as string[]);
    };
  }));
}

async function seedUrlRow(page: Page, row: QueueRow): Promise<void> {
  await page.evaluate(async (row) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('sploot_uploads', 4);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      const metadata = db.objectStoreNames.contains('pending_uploads')
        ? request.transaction!.objectStore('pending_uploads')
        : db.createObjectStore('pending_uploads', { keyPath: 'id' });
      for (const [name, keyPath] of [['addedAt', 'addedAt'], ['status', 'status'], ['claimExpiresAt', 'claimExpiresAt'], ['ownerKey', 'ownerKey']] as const) {
        if (!metadata.indexNames.contains(name)) metadata.createIndex(name, keyPath, { unique: false });
      }
      if (!db.objectStoreNames.contains('upload_payloads')) db.createObjectStore('upload_payloads', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const transaction = request.result.transaction('pending_uploads', 'readwrite');
      transaction.objectStore('pending_uploads').put(row);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('seed transaction aborted'));
    };
  }), row);
}

async function pasteUrl(page: Page, url: string): Promise<void> {
  await page.evaluate((value) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', value);
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: clipboard }));
  }, url);
}

async function startImageFixture({ delayMs = 0, status = 200, contentType = 'image/png' } = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((_request, response) => {
    setTimeout(() => {
      response.statusCode = status;
      response.setHeader('content-type', contentType);
      response.end(Buffer.from([137, 80, 78, 71]));
    }, delayMs);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind a port');
  return {
    url: `http://127.0.0.1:${address.port}/fixture.png`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('public upload surface durably enqueues metadata without materializing the payload in list state', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await openApp(page, 'qa-upload-queue-user');
    await context.setOffline(true);
    await page.locator('input[type="file"]').setInputFiles({ name: 'browser-queue.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(intentList(page).getByText('browser-queue.png', { exact: true })).toBeVisible();

    const rows = await readRows(page, await ownerKey('qa-upload-queue-user'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ intent: 'file', filename: 'browser-queue.png' });
    expect(rows[0]).not.toHaveProperty('fileData');
    expect(await readPayloadIds(page)).toEqual([rows[0].id]);
  } finally {
    await context.close();
  }
});

test('persistent Chromium restart preserves URL and file intent while A, B, and signed-out views stay isolated', async ({ browser, baseURL }) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sploot-upload-queue-'));
  let context: BrowserContext | undefined;
  const accountA = 'qa-upload-tabs-user';
  const accountB = 'qa-upload-queue-user';
  const accountAKey = await ownerKey(accountA);
  const url = 'https://images.example.test/bookmark.png';
  const browserBaseURL = baseURL.replace('127.0.0.1', 'sploot-pwa.test');
  const persistentBrowserArgs = [
    '--no-proxy-server',
    '--proxy-bypass-list=*',
    '--host-resolver-rules=MAP sploot-pwa.test 127.0.0.1',
  ];
  try {
    context = await browser.browserType().launchPersistentContext(userDataDir, {
      args: persistentBrowserArgs,
      baseURL: browserBaseURL,
      chromiumSandbox: false,
      headless: true,
    });
    await context.setOffline(false);
    const signedOut = context.pages()[0] ?? await context.newPage();
    await openSignedOutApp(signedOut);
    const accountATab = await context.newPage();
    const accountBTab = await context.newPage();
    await Promise.all([openApp(accountATab, accountA), openApp(accountBTab, accountB)]);
    await context.setOffline(true);

    await accountATab.locator('input[type="file"]').setInputFiles({ name: 'account-a.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(intentList(accountATab).getByText('account-a.png', { exact: true })).toBeVisible();
    await pasteUrl(accountATab, url);
    await expect(intentList(accountATab).getByText(url, { exact: true })).toBeVisible();

    const accountARows = await readRows(accountATab, accountAKey);
    expect(accountARows).toHaveLength(2);
    expect(accountARows.find((row) => row.intent === 'url')).toMatchObject({ sourceUrl: url, filename: url });
    const fileRow = accountARows.find((row) => row.filename === 'account-a.png');
    expect(fileRow).toBeTruthy();
    expect(fileRow).not.toHaveProperty('fileData');
    expect(await readPayloadIds(accountATab)).toContain(fileRow!.id);

    await expect(intentList(accountBTab).getByText('account-a.png', { exact: true })).toHaveCount(0);
    await expect(intentList(accountBTab).getByText(url, { exact: true })).toHaveCount(0);
    expect(await readRows(accountBTab, await ownerKey(accountB))).toEqual([]);

    await expect(signedOut.locator('body')).not.toContainText('account-a.png');
    await expect(signedOut.locator('body')).not.toContainText(url);
    expect((await readRows(signedOut, accountAKey)).map((row) => row.filename)).toEqual(expect.arrayContaining(['account-a.png', url]));
    await signedOut.close();
    await context.close();
    context = undefined;

    context = await browser.browserType().launchPersistentContext(userDataDir, {
      args: persistentBrowserArgs,
      baseURL: browserBaseURL,
      chromiumSandbox: false,
      headless: true,
    });
    const reopened = await context.newPage();
    await context.setOffline(true);
    await openApp(reopened, accountA);
    await expect(reopened.getByText('account-a.png')).toBeVisible();
    await expect(reopened.getByText(url)).toBeVisible();
    expect(await readRows(reopened, accountAKey)).toHaveLength(2);
  } finally {
    await context?.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('live lease-expiry wakeup reclaims a durable URL claim without reload or manual action', async ({ browser, baseURL }) => {
  const fixture = await startImageFixture({ status: 404 });
  const account = 'qa-upload-pwa-user';
  const key = randomUUID();
  const now = Date.now();
  const row: QueueRow = {
    id: key,
    ownerKey: await ownerKey(account),
    intent: 'url',
    filename: fixture.url,
    mimeType: 'text/uri-list',
    size: 0,
    lastModified: now,
    sourceUrl: fixture.url,
    addedAt: now,
    firstAddedAt: now,
    attemptStartedAt: now,
    status: 'uploading',
    retryCount: 0,
    claimGeneration: 1,
    claimOwner: 'stale-tab-owner',
    claimToken: 'stale-generation-token',
    claimExpiresAt: now + 5_000,
  };
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const requests: Array<{ key: string | undefined; at: number }> = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/upload/url')) {
      requests.push({ key: request.headers()['idempotency-key'], at: Date.now() });
    }
  });
  try {
    await establishOrigin(page, account);
    await seedUrlRow(page, row);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForUploadReady(page);
    await expect(durableQueue(page).getByText(fixture.url, { exact: true })).toBeVisible();
    await expect.poll(() => requests.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(requests[0].key).toBe(key);
    expect(requests[0].at).toBeGreaterThanOrEqual(row.claimExpiresAt! - 500);
    await expect.poll(async () => (await readRows(page, await ownerKey(account)))[0]?.claimGeneration, { timeout: 10_000 }).toBeGreaterThan(1);
    const reclaimed = (await readRows(page, await ownerKey(account)))[0];
    expect(reclaimed.claimOwner).not.toBe('stale-tab-owner');
    expect(reclaimed.claimToken).not.toBe('stale-generation-token');
  } finally {
    await context.close();
    await fixture.close();
  }
});

test('permanent URL rejection is terminal and remount recovery does not issue a second request', async ({ browser, baseURL }) => {
  const fixture = await startImageFixture({ status: 404 });
  const account = 'qa-upload-pwa-user';
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  let requestCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/upload/url')) requestCount += 1;
  });
  try {
    await openApp(page, account);
    await pasteUrl(page, fixture.url);
    await expect(durableQueue(page).getByText(fixture.url, { exact: true })).toBeVisible();
    await expect.poll(async () => (await readRows(page, await ownerKey(account)))[0]?.status, { timeout: 20_000 }).toBe('terminal');
    expect(requestCount).toBe(1);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(durableQueue(page).getByText(fixture.url, { exact: true })).toBeVisible();
    await page.waitForTimeout(2_000);
    expect(requestCount).toBe(1);
    await expect.poll(async () => (await readRows(page, await ownerKey(account)))[0]?.status).toBe('terminal');
  } finally {
    await context.close();
    await fixture.close();
  }
});

test('real public URL route returns 409 for a concurrent durable-key race', async ({ browser, baseURL }) => {
  const fixture = await startImageFixture({ delayMs: 2_000, status: 200 });
  const account = 'qa-upload-retry-user';
  const key = randomUUID();
  const now = Date.now();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const observedKeys: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/upload/url')) observedKeys.push(request.headers()['idempotency-key'] ?? '');
  });
  try {
    await openApp(page, account);
    await seedUrlRow(page, {
      id: key,
      ownerKey: await ownerKey(account),
      intent: 'url',
      filename: fixture.url,
      mimeType: 'text/uri-list',
      size: 0,
      lastModified: now,
      sourceUrl: fixture.url,
      addedAt: now,
      firstAddedAt: now,
      attemptStartedAt: now,
      status: 'failed',
      retryCount: 0,
      claimGeneration: 0,
    });
    const responses = await page.evaluate(async ({ fixtureUrl, idempotencyKey }) => {
      const request = () => fetch('/api/upload/url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ url: fixtureUrl }),
      }).then(async (response) => ({ status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json() }));
      return Promise.all([request(), request()]);
    }, { fixtureUrl: fixture.url, idempotencyKey: key });

    expect(observedKeys).toHaveLength(2);
    expect(observedKeys).toEqual([key, key]);
    const inProgress = responses.find((response) => response.status === 409);
    expect(inProgress).toMatchObject({ status: 409, retryAfter: '2', body: { code: 'UPLOAD_IN_PROGRESS', retryable: true } });
  } finally {
    await context.close();
    await fixture.close();
  }
});

test('production service worker activates and ZIP expansion rejects oversized entry sets in Chromium', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await openApp(page, 'qa-upload-pwa-user');
    let controlled = await waitForControllerTransition(page);
    if (!controlled) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      controlled = await waitForControllerTransition(page);
    }
    await waitForUploadReady(page);
    const worker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { registered: false, controlled: false };
      const registration = await navigator.serviceWorker.ready;
      return { registered: Boolean(registration.active), controlled: Boolean(navigator.serviceWorker.controller) };
    });
    expect(worker).toEqual({ registered: true, controlled: true });

    await context.setOffline(true);
    const entries = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`${index}.png`, new Uint8Array([137, 80, 78, 71])]));
    const zip = zipSync(entries);
    await page.locator('input[type="file"]').setInputFiles({ name: 'too-many.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await expect(page.getByText(/entry safety bound/i)).toBeVisible();
  } finally {
    await context.close();
  }
});
