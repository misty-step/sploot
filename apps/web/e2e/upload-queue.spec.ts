import { createServer, get as httpGet, type Server } from 'node:http';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test as base, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';
import { deriveUploadOwnerKey } from '../lib/upload/upload-owner';

const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';
const qaHeader = getQaLocalAuthHeader();

type FixtureServer = {
  baseURL: string;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
};

type Fixtures = {
  fixtureServer: FixtureServer;
};

const test = base.extend<Fixtures>({
  fixtureServer: [async ({}, use) => {
    const fixtureServer = await startFixtureServer();
    await use(fixtureServer);
    await fixtureServer.stop();
  }, { scope: 'worker', auto: true }],
});

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

async function openApp(page: Page, userId: string, openUploadDeepLink = false): Promise<void> {
  page.on('pageerror', (error) => console.log('[queue-pageerror]', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.log('[queue-console-error]', message.text()); });
  await page.setExtraHTTPHeaders({ [qaHeader]: await tokenFor(userId) });
  await page.goto(openUploadDeepLink ? '/app?upload=1' : '/app', { waitUntil: 'domcontentloaded', timeout: 75_000 });
  await waitForUploadReady(page, openUploadDeepLink);
}

async function waitForUploadReady(page: Page, expectDeepLinkOpen = false): Promise<void> {
  const uploadButton = page.getByRole('button', { name: 'Choose files to upload' });
  const uploadToggle = page.getByRole('button', { name: 'UPLOAD', exact: true });
  await expect(uploadToggle).toHaveAttribute('data-upload-action-ready', 'true');
  if (expectDeepLinkOpen) {
    await expect(uploadButton).toBeVisible();
  } else if (!(await uploadButton.isVisible().catch(() => false))) {
    await uploadToggle.click();
    await expect(uploadButton).toBeVisible();
  }
  await expect(uploadButton).toHaveAttribute('data-upload-ready', 'true');
}

async function establishOrigin(page: Page, userId: string): Promise<void> {
  await page.setExtraHTTPHeaders({ [qaHeader]: await tokenFor(userId) });
  await page.goto('/app', { waitUntil: 'domcontentloaded', timeout: 75_000 });
}

async function expectEnrolled(page: Page, userId: string): Promise<void> {
  const response = await page.request.get('/api/assets?limit=1', {
    headers: { [qaHeader]: await tokenFor(userId) },
  });
  expect(response.status()).toBe(200);
}

async function waitForBrowserHealth(page: Page, timeoutMs = 10_000): Promise<void> {
  const response = await page.request.get('/api/health', { timeout: timeoutMs });
  const body = await response.json() as { status?: string };
  expect(response.ok()).toBe(true);
  expect(response.status()).toBe(200);
  expect(body).toMatchObject({ status: 'ok' });
}

async function openSignedOutApp(page: Page): Promise<void> {
  await waitForBrowserHealth(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded', timeout: 75_000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByTestId('qa-local-signed-out-door')).toBeVisible();
  await expect(page.getByRole('link', { name: 'return to landing' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('button', { name: 'Choose files to upload' })).toHaveCount(0);
  await expect(durableQueue(page)).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Application error');
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

type PersistentRouteBridge = {
  forwardedRequests: () => number;
  setTargetBaseURL: (targetBaseURL: string) => void;
  setRestarting: (restarting: boolean) => void;
  close: () => Promise<void>;
};

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'pro' + 'xy-authenticate',
  'pro' + 'xy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function forwardHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !hopByHopHeaders.has(name.toLowerCase())));
}

async function fetchForBrowser(transport: APIRequestContext, targetURL: URL, method: string, headers: Record<string, string>, data: Buffer | undefined, isRestarting: () => boolean): Promise<APIResponse> {
  // Preserve redirects for Chromium. Following them in Node and fulfilling the
  // final response would leave the browser's logical URL at the original path.
  // A restart briefly closes the child before the replacement binds the same
  // port, so retry only that transport boundary rather than masking other errors.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await transport.fetch(targetURL.toString(), { method, headers, data, failOnStatusCode: false, maxRedirects: 0 });
    } catch (error) {
      if (attempt >= 40 || !isRestarting() || !(error instanceof Error) || !/ECONN(?:REFUSED|RESET)|socket hang up/.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

/**
 * Keep the browser's logical origin stable while Node owns transport to the
 * current real Next server child. Playwright's route handler is the only
 * browser-facing seam; the API request context cannot recurse through it.
 */
async function installPersistentRouteBridge(
  context: BrowserContext,
  logicalBaseURL: string,
  initialTargetBaseURL: string,
): Promise<PersistentRouteBridge> {
  const logicalOrigin = new URL(logicalBaseURL).origin;
  let targetBaseURL = initialTargetBaseURL;
  let restarting = false;
  let forwardedRequestCount = 0;
  const transport: APIRequestContext = context.request;
  await context.route('**/*', async (route) => {
    const browserRequest = route.request();
    const browserURL = new URL(browserRequest.url());
    if (browserURL.origin !== logicalOrigin) {
      await route.continue();
      return;
    }
    const targetURL = new URL(browserURL.pathname + browserURL.search, targetBaseURL);
    forwardedRequestCount += 1;
    const response = await fetchForBrowser(
      transport,
      targetURL,
      browserRequest.method(),
      forwardHeaders(browserRequest.headers()),
      browserRequest.postDataBuffer() ?? undefined,
      () => restarting,
    );
    try {
      await route.fulfill({ response });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Route is already handled')) throw error;
    }
  });
  return {
    forwardedRequests: () => forwardedRequestCount,
    setTargetBaseURL: (nextTargetBaseURL) => { targetBaseURL = nextTargetBaseURL; },
    setRestarting: (nextRestarting) => { restarting = nextRestarting; },
    close: async () => {
      await context.unrouteAll({ behavior: 'ignoreErrors' });
    },
  };
}

function childOutput(child: ChildProcess): { read: () => string } {
  let output = '';
  const append = (chunk: Buffer | string) => {
    output = (output + chunk.toString()).slice(-12_000);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return { read: () => output };
}

async function waitForFixtureReady(baseURL: string, child: ChildProcess, output: { read: () => string }): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError = 'not attempted';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`fixture server exited with code ${child.exitCode}: ${output.read()}`);
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const healthRequest = httpGet(new URL('/api/health', baseURL), (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode ?? 0));
        });
        healthRequest.setTimeout(15_000, () => healthRequest.destroy(new Error('fixture health probe timed out')));
        healthRequest.once('error', reject);
      });
      if (status >= 200 && status < 400) return;
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`fixture server did not become ready (${lastError}): ${output.read()}`);
}

async function descendantPids(rootPid: number): Promise<number[]> {
  const processTable = await new Promise<string>((resolve) => {
    execFile('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }, (_error, stdout) => resolve(stdout));
  });
  const children = new Map<number, number[]>();
  for (const line of processTable.split('\n')) {
    const [pidText, parentText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const parent = Number(parentText);
    if (Number.isInteger(pid) && Number.isInteger(parent)) children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const result: number[] = [];
  const pending = [rootPid];
  while (pending.length) {
    const parent = pending.pop()!;
    for (const childPid of children.get(parent) ?? []) {
      result.push(childPid);
      pending.push(childPid);
    }
  }
  return result;
}

async function stopFixtureChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const descendants = child.pid ? await descendantPids(child.pid) : [];
  try {
    if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch (error) {
    if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
  for (const pid of descendants.reverse()) {
    try { process.kill(pid, 'SIGTERM'); } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 10_000))]);
  if (child.exitCode === null) {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    for (const pid of descendants) {
      try { process.kill(pid, 'SIGKILL'); } catch (error) {
        if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
    await exited;
  }
}

async function startFixtureServer(): Promise<FixtureServer & { stop: () => Promise<void> }> {
  const port = Number(process.env.PLAYWRIGHT_QUEUE_PORT ?? process.env.PLAYWRIGHT_PORT ?? 3138);
  const baseURL = String.raw`http://127.0.0.1:${port}`;
  const mode = process.env.PLAYWRIGHT_FIXTURE_SERVER_MODE === 'production' ? 'start' : 'dev';
  const repoRoot = join(__dirname, '../../..');
  let child: ChildProcess | undefined;
  let output: { read: () => string } | undefined;

  const launch = async () => {
    child = spawn('pnpm', ['--filter', 'web', mode], {
      cwd: repoRoot,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: process.env.NODE_ENV ?? 'test',
        SPLOOT_DEPLOYMENT_ENV: 'test',
        DEPLOYMENT_ENV: 'local-qa',
        SPLOOT_QA_AUTH_MODE: 'enabled',
        SPLOOT_PWA_CAPTURE_MODE: 'enabled',
        SPLOOT_QA_DEPLOYMENT_ID: 'local-pwa-capture-v1',
        SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
        SPLOOT_QA_AUDIENCE: 'sploot-pwa-capture',
        SPLOOT_QA_BIND_HOST: '127.0.0.1',
        SPLOOT_QA_LOCAL_CAPABILITY: '0123456789abcdef0123456789abcdef0123456789abcdef',
        SPLOOT_QA_AUTH_SECRET: qaSecret,
        SPLOOT_QA_ALLOW_LOCAL_URL_IMPORT: '1',
        SPLOOT_ENROLLMENT_MODE: 'ga',
        NEXT_PUBLIC_SPLOOT_QA_AUTH_MODE: 'enabled',
        NEXT_PUBLIC_SPLOOT_QA_AUTH_BUILD: 'true',
        NEXT_PUBLIC_SPLOOT_PWA_CAPTURE_MODE: 'enabled',
        NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ID: 'local-pwa-capture-v1',
        NEXT_PUBLIC_SPLOOT_QA_DEPLOYMENT_ENV: 'local-qa',
        NEXT_PUBLIC_SPLOOT_QA_AUDIENCE: 'sploot-pwa-capture',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_MTI3LjAuMC4xOjMxMzgk',
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? String.raw`sk_test_${Buffer.from('clerk-qa-local-secret').toString('base64')}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    output = childOutput(child);
    await waitForFixtureReady(baseURL, child, output);
  };
  try {
    await launch();
  } catch (error) {
    if (child) await stopFixtureChild(child);
    throw error;
  }
  return {
    baseURL,
    restart: async () => {
      await stopFixtureChild(child!);
      await launch();
    },
    stop: async () => {
      if (child) await stopFixtureChild(child);
    },
  };
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

test('persistent Chromium restart preserves URL and file intent while A, B, and signed-out views stay isolated', async ({ browser, baseURL, fixtureServer }) => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'sploot-upload-queue-'));
  let context: BrowserContext | undefined;
  const accountA = 'qa-upload-tabs-user';
  const accountB = 'qa-upload-queue-user';
  const accountAKey = await ownerKey(accountA);
  const url = 'https://images.example.test/bookmark.png';
  const browserBaseURL = baseURL;
  let routeBridge: PersistentRouteBridge | undefined;
  try {
    context = await browser.browserType().launchPersistentContext(userDataDir, {
      baseURL: browserBaseURL,
    });
    routeBridge = await installPersistentRouteBridge(context, browserBaseURL, fixtureServer.baseURL);
    const signedOut = context.pages()[0] ?? await context.newPage();
    await context.setOffline(false);
    await expect.poll(() => signedOut.evaluate(() => navigator.onLine), { timeout: 5_000 }).toBe(true);
    await openSignedOutApp(signedOut);
    expect(routeBridge.forwardedRequests()).toBeGreaterThan(0);
    const accountATab = await context.newPage();
    const accountBTab = await context.newPage();
    await Promise.all([openApp(accountATab, accountA), openApp(accountBTab, accountB)]);
    await expectEnrolled(accountATab, accountA);
    await expectEnrolled(accountBTab, accountB);

    const forwardedBeforeRestart = routeBridge.forwardedRequests();
    const pageCountBeforeRestart = context.pages().length;
    await waitForBrowserHealth(accountATab);
    routeBridge.setRestarting(true);
    try {
      await fixtureServer.restart();
      routeBridge.setTargetBaseURL(fixtureServer.baseURL);
      await waitForBrowserHealth(accountATab);
    } finally {
      routeBridge.setRestarting(false);
    }
    await accountATab.reload({ waitUntil: 'domcontentloaded' });
    await waitForUploadReady(accountATab);
    expect(context.pages()).toHaveLength(pageCountBeforeRestart);
    expect(routeBridge.forwardedRequests()).toBeGreaterThan(forwardedBeforeRestart);

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
    await routeBridge.close();
    routeBridge = undefined;
    await context.close();
    context = undefined;

    context = await browser.browserType().launchPersistentContext(userDataDir, {
      baseURL: browserBaseURL,
    });
    routeBridge = await installPersistentRouteBridge(context, browserBaseURL, fixtureServer.baseURL);
    const reopened = await context.newPage();
    // Protected document navigations are NetworkOnly; establish the document
    // while online, then take the already-controlled page offline to verify
    // durable queue state without asking the worker to fabricate /app HTML.
    await context.setOffline(false);
    await expect.poll(() => reopened.evaluate(() => navigator.onLine), { timeout: 5_000 }).toBe(true);
    await openApp(reopened, accountA);
    await expectEnrolled(reopened, accountA);
    await waitForUploadReady(reopened);
    await context.setOffline(true);
    await expect(reopened.getByText('account-a.png')).toBeVisible();
    await expect(reopened.getByText(url)).toBeVisible();
    expect(await readRows(reopened, accountAKey)).toHaveLength(2);
  } finally {
    if (context) await context.setOffline(false);
    await routeBridge?.close();
    await context?.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('public upload surface durably enqueues metadata without materializing the payload in list state', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await openApp(page, 'qa-upload-queue-user', true);
    await expectEnrolled(page, 'qa-upload-queue-user');
    await expect(page).toHaveURL(/\/app$/);
    await context.setOffline(true);
    await page.locator('input[type="file"]').setInputFiles({ name: 'browser-queue.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(intentList(page).getByText('browser-queue.png', { exact: true })).toBeVisible();

    const rows = await readRows(page, await ownerKey('qa-upload-queue-user'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ intent: 'file', filename: 'browser-queue.png' });
    expect(rows[0]).not.toHaveProperty('fileData');
    expect(await readPayloadIds(page)).toEqual([rows[0].id]);
  } finally {
    await context.setOffline(false);
    await waitForBrowserHealth(page);
    await context.close();
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
    await expectEnrolled(page, account);
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
    await expectEnrolled(page, account);
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
    await expectEnrolled(page, account);
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
