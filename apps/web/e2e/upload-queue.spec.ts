import { expect, test } from '@playwright/test';
import { zipSync } from 'fflate';
import { createQaLocalAuthToken, getQaLocalAuthHeader } from '../lib/auth/qa-local';

const qaSecret = process.env.SPLOOT_QA_AUTH_SECRET ?? 'local-playwright-secret-with-enough-entropy';

test('public upload surface durably enqueues metadata without materializing the payload in list state', async ({ browser, baseURL }) => {
  const token = await createQaLocalAuthToken({
    userId: 'qa-upload-queue-user',
    email: 'qa-upload-queue@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { [getQaLocalAuthHeader()]: token },
  });
  const page = await context.newPage();

  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
  const dropZone = page.getByRole('button', { name: 'Choose files to upload' });
  await expect(dropZone).toBeVisible();
  await context.setOffline(true);

  const chooser = page.waitForEvent('filechooser');
  await dropZone.press('Enter');
  await (await chooser).setFiles({ name: 'browser-queue.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect(page.getByText('browser-queue.png')).toBeVisible();

  const rows = await page.evaluate(async () => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    const request = indexedDB.open('sploot_uploads', 4);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('pending_uploads', 'readonly');
      const get = transaction.objectStore('pending_uploads').getAll();
      get.onerror = () => reject(get.error);
      get.onsuccess = () => resolve(get.result as Array<Record<string, unknown>>);
    };
  }));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ intent: 'file', filename: 'browser-queue.png' });
  const expectedOwnerKey = await page.evaluate(async (userId) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
    return `account-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }, 'qa-upload-queue-user');
  expect(rows[0].ownerKey).toBe(expectedOwnerKey);
  expect(rows[0]).not.toHaveProperty('fileData');

  await context.close();
});

test('two Chromium tabs and a restart converge on the same durable owner partition', async ({ browser, baseURL }) => {
  const token = await createQaLocalAuthToken({
    userId: 'qa-upload-tabs-user',
    email: 'qa-upload-tabs@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { [getQaLocalAuthHeader()]: token } });
  const firstTab = await context.newPage();
  const secondTab = await context.newPage();
  await Promise.all([
    firstTab.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 }),
    secondTab.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 }),
  ]);
  await expect(firstTab.getByRole('button', { name: 'Choose files to upload' })).toBeVisible();
  await expect(secondTab.getByRole('button', { name: 'Choose files to upload' })).toBeVisible();
  await context.setOffline(true);

  await firstTab.locator('input[type="file"]').setInputFiles({
    name: 'restart-tab.png',
    mimeType: 'image/png',
    buffer: Buffer.from('png'),
  });
  await expect(firstTab.getByText('restart-tab.png')).toBeVisible();
  await expect(secondTab.getByText('restart-tab.png')).toBeVisible();

  await firstTab.reload({ waitUntil: 'domcontentloaded' });
  await expect(firstTab.getByText('restart-tab.png')).toBeVisible();
  await context.close();
});

test('public request seam preserves one idempotency key across 409 recovery', async ({ browser, baseURL }) => {
  const token = await createQaLocalAuthToken({
    userId: 'qa-upload-retry-user',
    email: 'qa-upload-retry@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { [getQaLocalAuthHeader()]: token } });
  const page = await context.newPage();
  const requests: Array<{ key: string | undefined; status: number }> = [];
  await page.route('**/api/upload', async (route) => {
    const key = route.request().headers()['idempotency-key'];
    if (route.request().method() !== 'POST') return route.continue();
    const status = requests.length === 0 ? 409 : 201;
    requests.push({ key, status });
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 409
      ? { success: false, code: 'UPLOAD_IN_PROGRESS', retryable: true }
      : { success: true, asset: { id: 'browser-asset' } }) });
  });
  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
  await expect(page.getByRole('button', { name: 'Choose files to upload' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await expect.poll(() => requests.length, { timeout: 20_000 }).toBe(2);
  expect(requests[0].status).toBe(409);
  expect(requests[1].status).toBe(201);
  expect(requests[0].key).toBeTruthy();
  expect(requests[1].key).toBe(requests[0].key);
  await context.close();
});

test('production service worker activates and ZIP expansion rejects oversized entry sets in Chromium', async ({ browser, baseURL }) => {
  const token = await createQaLocalAuthToken({
    userId: 'qa-upload-pwa-user',
    email: 'qa-upload-pwa@sploot.test',
    secret: qaSecret,
    expiresInSeconds: 5 * 60,
  });
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { [getQaLocalAuthHeader()]: token } });
  const page = await context.newPage();
  await page.goto('/app?upload=1', { waitUntil: 'domcontentloaded', timeout: 75_000 });
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
  await context.close();
});
